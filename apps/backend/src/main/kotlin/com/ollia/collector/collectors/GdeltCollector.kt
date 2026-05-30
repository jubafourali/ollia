package com.ollia.collector.collectors

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ollia.collector.SafetyCollector
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.repository.RawSafetySignalRepository
import com.ollia.util.HashUtils
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.format.DateTimeFormatter

/**
 * GDELT Project collector — global news event monitoring.
 *
 * Free, no API key, real-time. Uses the GDELT 2.1 GKG (Global Knowledge Graph)
 * via the DOC API which returns structured news events with country codes,
 * tone, and theme classification.
 *
 * Covers: armed conflict, terrorism, civil unrest, protests, riots, mass
 * shootings, and security incidents globally — fills the biggest gap in
 * Ollia's natural-disaster-only collector set.
 *
 * API docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */
@Component
class GdeltCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.GDELT

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(10 * 1024 * 1024) }
        .build()

    // Themes we care about — GDELT's standardised event taxonomy.
    // Combined OR query filters to safety-relevant events only.
    private val themeFilter = listOf(
        "TERROR",
        "ARMEDCONFLICT",
        "PROTEST",
        "KILL",
        "CIVIL_UNREST"
    ).joinToString(" OR ") { "theme:$it" }

    private val baseUrl = "https://api.gdeltproject.org/api/v2/doc/doc"

    override fun collect(): List<RawSafetyEvent> {
        val url = "$baseUrl?query=$themeFilter&mode=ArtList&maxrecords=75&format=JSON&sort=DateDesc&timespan=2H"

        val response = webClient.get()
            .uri(url)
            .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val articles = response["articles"] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()

        articles.forEach { article ->
            try {
                val url = article["url"]?.asText() ?: return@forEach
                val externalId = url  // GDELT articles deduped by URL

                if (repository.existsBySourceAndExternalId(source, externalId)) {
                    return@forEach
                }

                val title = article["title"]?.asText() ?: return@forEach
                val country = article["sourcecountry"]?.asText()
                val language = article["language"]?.asText()?.lowercase()?.take(5) ?: "en"

                // GDELT seendate format: YYYYMMDDHHMMSS
                val seenDate = article["seendate"]?.asText()
                val eventOccurredAt = parseGdeltDate(seenDate) ?: now

                val (category, severity) = inferCategoryAndSeverity(title)

                // Tone score (negative = bad news, positive = good) helps severity
                val tone = article["tone"]?.asDouble() ?: 0.0
                val adjustedSeverity = when {
                    tone < -8.0 -> Severity.HIGH      // very negative
                    tone < -4.0 -> severity            // already set
                    else -> if (severity == Severity.CRITICAL) Severity.HIGH else severity
                }

                val payloadString = objectMapper.writeValueAsString(article)
                val contentHash = HashUtils.sha256(payloadString)

                if (repository.existsBySourceAndContentHash(source, contentHash)) {
                    return@forEach
                }

                collectedSignals.add(
                    RawSafetyEvent(
                        source = source,
                        externalId = externalId,
                        title = title.take(1000),
                        description = null,  // GDELT doc API returns no body
                        sourceUrl = url,
                        country = country,
                        city = null,         // GDELT GKG provides cities — could enrich later
                        latitude = null,
                        longitude = null,
                        eventOccurredAt = eventOccurredAt,
                        collectedAt = now,
                        category = category,
                        severityHint = adjustedSeverity,
                        language = language,
                        contentHash = contentHash,
                        rawPayload = article
                    )
                )
            } catch (e: Exception) {
                logger.warn("Skipping GDELT article due to parse error", e)
            }
        }

        logger.info("GDELT collector fetched ${collectedSignals.size} signals")
        return collectedSignals
    }

    /**
     * Infer SafetyCategory + Severity from article title text.
     * Order matters — most specific match wins.
     */
    private fun inferCategoryAndSeverity(title: String): Pair<SafetyCategory, Severity> {
        val t = title.lowercase()
        return when {
            // War / conflict — highest severity
            t.contains("missile") && (t.contains("strike") || t.contains("attack") || t.contains("hit")) ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL

            t.contains("airstrike") || t.contains("air strike") ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL

            t.contains("war") || (t.contains("armed") && t.contains("conflict")) ->
                SafetyCategory.ARMED_CONFLICT to Severity.HIGH

            // Active terror / violence
            t.contains("terror") || t.contains("bombing") || t.contains("bomb attack") ->
                SafetyCategory.TERRORISM to Severity.HIGH

            t.contains("explosion") || t.contains("blast") ->
                SafetyCategory.EXPLOSION to Severity.HIGH

            t.contains("active shooter") || t.contains("gunman") ->
                SafetyCategory.ACTIVE_SHOOTER to Severity.CRITICAL

            t.contains("mass shooting") || t.contains("shooting") ->
                SafetyCategory.VIOLENCE to Severity.HIGH

            // Civil unrest
            t.contains("riot") ->
                SafetyCategory.RIOT to Severity.HIGH

            t.contains("protest") || t.contains("demonstration") || t.contains("rally") ->
                SafetyCategory.PROTEST to Severity.MEDIUM

            t.contains("curfew") ->
                SafetyCategory.CURFEW to Severity.MEDIUM

            t.contains("unrest") || t.contains("clash") ->
                SafetyCategory.CIVIL_UNREST to Severity.MEDIUM

            // Border issues
            t.contains("border") && (t.contains("closed") || t.contains("shut")) ->
                SafetyCategory.BORDER_TENSION to Severity.MEDIUM

            // Fallback for safety-themed but unclassified
            else ->
                SafetyCategory.VIOLENCE to Severity.LOW
        }
    }

    private fun parseGdeltDate(raw: String?): Instant? {
        if (raw == null || raw.length < 14) return null
        return try {
            // GDELT format: YYYYMMDDHHMMSS → ISO 8601
            val year   = raw.substring(0, 4)
            val month  = raw.substring(4, 6)
            val day    = raw.substring(6, 8)
            val hour   = raw.substring(8, 10)
            val minute = raw.substring(10, 12)
            val second = raw.substring(12, 14)
            Instant.parse("$year-$month-${day}T$hour:$minute:${second}Z")
        } catch (_: Exception) {
            null
        }
    }
}
