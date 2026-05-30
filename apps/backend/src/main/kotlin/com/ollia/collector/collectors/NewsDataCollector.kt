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
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * NewsData.io collector — global news aggregator.
 *
 * Free tier: 200 requests/day, 10 articles per request. Returns structured
 * JSON with country, category, source, language, and pubDate.
 *
 * Pulls "top" and "world" categories with safety-relevant keyword filter.
 * Skips entirely if NEWSDATA_API_KEY environment variable is not set —
 * graceful degradation so the rest of the system runs without it.
 *
 * API docs: https://newsdata.io/documentation
 */
@Component
class NewsDataCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository,
    @Value("\${newsdata.api-key:}") private val apiKey: String
) : SafetyCollector {

    override val source = SourceType.NEWSDATA

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(10 * 1024 * 1024) }
        .build()

    private val baseUrl = "https://newsdata.io/api/1/latest"

    // Safety-relevant keywords — narrows the firehose to events Ollia cares about
    private val keywords = listOf(
        "missile", "airstrike", "war", "conflict", "attack",
        "terrorist", "explosion", "shooting", "shooter",
        "protest", "riot", "unrest", "curfew",
        "evacuation", "emergency", "disaster"
    ).joinToString(" OR ")

    override fun collect(): List<RawSafetyEvent> {
        if (apiKey.isBlank()) {
            logger.debug("NewsData collector skipped — NEWSDATA_API_KEY not configured")
            return emptyList()
        }

        val url = "$baseUrl?apikey=$apiKey&q=$keywords&category=top,world&language=en,fr,ar,es"

        val response = try {
            webClient.get()
                .uri(url)
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("NewsData fetch failed", e)
            return emptyList()
        } ?: return emptyList()

        val status = response["status"]?.asText()
        if (status != "success") {
            logger.warn("NewsData API returned status=$status — ${response["message"]?.asText()}")
            return emptyList()
        }

        val results = response["results"] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()

        results.forEach { article ->
            try {
                val articleId = article["article_id"]?.asText() ?: return@forEach

                if (repository.existsBySourceAndExternalId(source, articleId)) {
                    return@forEach
                }

                val title = article["title"]?.asText() ?: return@forEach
                val description = article["description"]?.asText()
                val link = article["link"]?.asText()
                val language = article["language"]?.asText()?.take(5) ?: "en"

                // Country can be an array — take the first one
                val country = article["country"]
                    ?.takeIf { it.isArray && it.size() > 0 }
                    ?.get(0)?.asText()
                    ?: article["country"]?.asText()

                // pubDate format: "2026-05-25 14:32:00"
                val pubDate = article["pubDate"]?.asText()
                val eventOccurredAt = parsePubDate(pubDate) ?: now

                val (category, severity) = inferCategoryAndSeverity(title, description)

                val payloadString = objectMapper.writeValueAsString(article)
                val contentHash = HashUtils.sha256(payloadString)

                if (repository.existsBySourceAndContentHash(source, contentHash)) {
                    return@forEach
                }

                collectedSignals.add(
                    RawSafetyEvent(
                        source = source,
                        externalId = articleId,
                        title = title.take(1000),
                        description = description?.take(5000),
                        sourceUrl = link,
                        country = country,
                        city = null,
                        latitude = null,
                        longitude = null,
                        eventOccurredAt = eventOccurredAt,
                        collectedAt = now,
                        category = category,
                        severityHint = severity,
                        language = language,
                        contentHash = contentHash,
                        rawPayload = article
                    )
                )
            } catch (e: Exception) {
                logger.warn("Skipping NewsData article due to parse error", e)
            }
        }

        logger.info("NewsData collector fetched ${collectedSignals.size} signals")
        return collectedSignals
    }

    /**
     * Classify article into SafetyCategory + Severity from title and description.
     * Same taxonomy as GDELT — keeps event types consistent across sources for
     * proper origin-chain detection in the Police Engine.
     */
    private fun inferCategoryAndSeverity(title: String, description: String?): Pair<SafetyCategory, Severity> {
        val text = (title + " " + (description ?: "")).lowercase()
        return when {
            text.contains("missile") && (text.contains("strike") || text.contains("attack") || text.contains("hit")) ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL

            text.contains("airstrike") || text.contains("air strike") ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL

            text.contains("war ") || (text.contains("armed") && text.contains("conflict")) ->
                SafetyCategory.ARMED_CONFLICT to Severity.HIGH

            text.contains("terror") || text.contains("bombing") || text.contains("bomb attack") ->
                SafetyCategory.TERRORISM to Severity.HIGH

            text.contains("explosion") || text.contains("blast") ->
                SafetyCategory.EXPLOSION to Severity.HIGH

            text.contains("active shooter") || text.contains("gunman") ->
                SafetyCategory.ACTIVE_SHOOTER to Severity.CRITICAL

            text.contains("mass shooting") ->
                SafetyCategory.VIOLENCE to Severity.HIGH

            text.contains("riot") ->
                SafetyCategory.RIOT to Severity.HIGH

            text.contains("protest") || text.contains("demonstration") ->
                SafetyCategory.PROTEST to Severity.MEDIUM

            text.contains("curfew") ->
                SafetyCategory.CURFEW to Severity.MEDIUM

            text.contains("unrest") || text.contains("clash") ->
                SafetyCategory.CIVIL_UNREST to Severity.MEDIUM

            text.contains("border") && (text.contains("closed") || text.contains("shut")) ->
                SafetyCategory.BORDER_TENSION to Severity.MEDIUM

            text.contains("evacuation") || text.contains("evacuated") ->
                SafetyCategory.OTHER to Severity.HIGH

            text.contains("emergency") ->
                SafetyCategory.OTHER to Severity.MEDIUM

            else ->
                SafetyCategory.OTHER to Severity.LOW
        }
    }

    private fun parsePubDate(raw: String?): Instant? {
        if (raw == null) return null
        return try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            LocalDateTime.parse(raw, formatter).toInstant(ZoneOffset.UTC)
        } catch (_: Exception) {
            try {
                Instant.parse(raw)  // fallback if it ever returns ISO
            } catch (_: Exception) {
                null
            }
        }
    }
}
