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
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

/**
 * GDELT Project collector — global news event monitoring.
 *
 * Free, no API key, real-time. Covers conflict, terrorism, civil unrest,
 * protests globally across 100+ languages.
 *
 * Throttled to 30 minutes between calls. GDELT sometimes returns HTML
 * instead of JSON (rate-limit page) — handled gracefully by reading
 * as raw String first, then parsing only if valid JSON.
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

    private val baseUrl = "https://api.gdeltproject.org/api/v2/doc/doc"
    private val themeFilter = "theme:TERROR OR theme:ARMEDCONFLICT OR theme:PROTEST OR theme:KILL OR theme:CIVIL_UNREST"

    // 30 minutes between calls — GDELT rate limits aggressively
    private val minIntervalMs = 30 * 60 * 1000L
    private val backoffMs     = 60 * 60 * 1000L
    private val lastCallAt    = AtomicLong(0L)
    private val backoffUntil  = AtomicLong(0L)

    override fun collect(): List<RawSafetyEvent> {
        val now = System.currentTimeMillis()
        if (now < backoffUntil.get()) {
            logger.debug("GDELT backing off — ${(backoffUntil.get() - now) / 60_000} min remaining")
            return emptyList()
        }
        if (now - lastCallAt.get() < minIntervalMs) {
            logger.debug("GDELT throttled — ${(minIntervalMs - (now - lastCallAt.get())) / 60_000} min until next call")
            return emptyList()
        }
        lastCallAt.set(now)

        val url = "$baseUrl?query=$themeFilter&mode=ArtList&maxrecords=75&format=JSON&sort=DateDesc&timespan=3H"

        // Read as String first — GDELT sometimes returns HTML rate-limit pages with 200 OK
        val rawBody = try {
            webClient.get()
                .uri(url)
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .accept(MediaType.ALL)
                .retrieve()
                .onStatus({ it.value() == 429 }) { _ ->
                    backoffUntil.set(System.currentTimeMillis() + backoffMs)
                    logger.warn("GDELT 429 — backing off 60 min")
                    throw RuntimeException("GDELT rate limited")
                }
                .bodyToMono(String::class.java)
                .block()
        } catch (e: Exception) {
            if (!e.message.orEmpty().contains("rate limited")) {
                logger.warn("GDELT fetch failed: ${e.message}")
            }
            return emptyList()
        } ?: return emptyList()

        // GDELT returned HTML (rate-limit or error page) — back off
        if (!rawBody.trimStart().startsWith("{") && !rawBody.trimStart().startsWith("[")) {
            logger.warn("GDELT returned non-JSON response — backing off 60 min")
            backoffUntil.set(System.currentTimeMillis() + backoffMs)
            return emptyList()
        }

        val response: JsonNode = try {
            objectMapper.readTree(rawBody)
        } catch (e: Exception) {
            logger.warn("GDELT JSON parse failed: ${e.message}")
            return emptyList()
        }

        val articles = response["articles"] ?: return emptyList()
        val nowInstant = Instant.now()
        val collected = mutableListOf<RawSafetyEvent>()

        articles.forEach { article ->
            try {
                val articleUrl = article["url"]?.asText() ?: return@forEach
                if (repository.existsBySourceAndExternalId(source, articleUrl)) return@forEach

                val title = article["title"]?.asText() ?: return@forEach
                val country = article["sourcecountry"]?.asText()
                val language = article["language"]?.asText()?.lowercase()?.take(5) ?: "en"
                val eventOccurredAt = parseGdeltDate(article["seendate"]?.asText()) ?: nowInstant
                val tone = article["tone"]?.asDouble() ?: 0.0
                val (category, severity) = inferCategoryAndSeverity(title, tone)

                val payloadString = objectMapper.writeValueAsString(article)
                val contentHash = HashUtils.sha256(payloadString)
                if (repository.existsBySourceAndContentHash(source, contentHash)) return@forEach

                collected.add(
                    RawSafetyEvent(
                        source = source,
                        externalId = articleUrl,
                        title = title.take(1000),
                        description = null,
                        sourceUrl = articleUrl,
                        country = country,
                        city = null,
                        latitude = null,
                        longitude = null,
                        eventOccurredAt = eventOccurredAt,
                        collectedAt = nowInstant,
                        category = category,
                        severityHint = severity,
                        language = language,
                        contentHash = contentHash,
                        rawPayload = article
                    )
                )
            } catch (e: Exception) {
                logger.warn("Skipping GDELT article: ${e.message}")
            }
        }

        logger.info("GDELT collector fetched ${collected.size} signals")
        return collected
    }

    private fun inferCategoryAndSeverity(title: String, tone: Double): Pair<SafetyCategory, Severity> {
        val t = title.lowercase()
        val baseSev = when { tone < -8.0 -> Severity.HIGH; tone < -4.0 -> Severity.MEDIUM; else -> Severity.LOW }
        return when {
            t.contains("missile") || t.contains("airstrike") || t.contains("air strike") ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL
            t.contains("war") || (t.contains("armed") && t.contains("conflict")) ->
                SafetyCategory.ARMED_CONFLICT to Severity.HIGH
            t.contains("terror") || t.contains("bombing") || t.contains("bomb attack") ->
                SafetyCategory.TERRORISM to Severity.HIGH
            t.contains("explosion") || t.contains("blast") ->
                SafetyCategory.EXPLOSION to Severity.HIGH
            t.contains("active shooter") || t.contains("gunman") ->
                SafetyCategory.ACTIVE_SHOOTER to Severity.CRITICAL
            t.contains("mass shooting") || t.contains("shooting") ->
                SafetyCategory.VIOLENCE to Severity.HIGH
            t.contains("riot") ->
                SafetyCategory.RIOT to Severity.HIGH
            t.contains("protest") || t.contains("demonstration") ->
                SafetyCategory.PROTEST to baseSev
            t.contains("curfew") ->
                SafetyCategory.CURFEW to Severity.MEDIUM
            t.contains("unrest") || t.contains("clash") ->
                SafetyCategory.CIVIL_UNREST to baseSev
            else ->
                SafetyCategory.VIOLENCE to baseSev
        }
    }

    private fun parseGdeltDate(raw: String?): Instant? {
        if (raw == null || raw.length < 14) return null
        return try {
            Instant.parse("${raw.substring(0,4)}-${raw.substring(4,6)}-${raw.substring(6,8)}T${raw.substring(8,10)}:${raw.substring(10,12)}:${raw.substring(12,14)}Z")
        } catch (_: Exception) { null }
    }
}