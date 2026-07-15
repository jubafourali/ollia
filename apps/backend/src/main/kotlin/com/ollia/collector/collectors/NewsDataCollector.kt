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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.util.UriComponentsBuilder
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicLong

/**
 * NewsData.io collector — optional news corroboration only.
 *
 * Disabled by default (see GdeltCollector). Enable with
 * `ollia.collectors.news.enabled=true` when a NewsData API key is configured.
 */
@Component
@ConditionalOnProperty(
    prefix = "ollia.collectors.news",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = false
)
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
    private val pubDateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    // Minimum 60 minutes between calls — keeps usage at ~24 credits/day
    private val minIntervalMs = 60 * 60 * 1000L
    private val lastCallAt = AtomicLong(0L)

    override fun collect(): List<RawSafetyEvent> {
        if (apiKey.isBlank()) {
            logger.debug("NewsData collector skipped — NEWSDATA_API_KEY not configured")
            return emptyList()
        }

        val now = System.currentTimeMillis()
        val elapsed = now - lastCallAt.get()
        if (elapsed < minIntervalMs) {
            val waitMin = (minIntervalMs - elapsed) / 60_000
            logger.debug("NewsData throttled — next call in $waitMin min")
            return emptyList()
        }

        lastCallAt.set(now)
        return fetchQuery("missile airstrike war conflict protest riot explosion shooting disaster")
    }

    private fun fetchQuery(q: String): List<RawSafetyEvent> {
        val uri = UriComponentsBuilder.fromHttpUrl(baseUrl)
            .queryParam("apikey", apiKey)
            .queryParam("q", q)
            .queryParam("category", "world,top")
            .queryParam("language", "en")
            .build()
            .toUri()

        val response = try {
            webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("NewsData fetch failed: ${e.message}")
            return emptyList()
        } ?: return emptyList()

        val status = response["status"]?.asText()
        if (status != "success") {
            logger.warn("NewsData API returned status=$status — ${response["message"]?.asText()}")
            return emptyList()
        }

        val results = response["results"] ?: return emptyList()
        val nowInstant = Instant.now()
        val collected = mutableListOf<RawSafetyEvent>()

        results.forEach { article ->
            try {
                val articleId = article["article_id"]?.asText() ?: return@forEach
                if (repository.existsBySourceAndExternalId(source, articleId)) return@forEach

                val title = article["title"]?.asText() ?: return@forEach
                val description = article["description"]?.asText()
                val link = article["link"]?.asText()
                val language = article["language"]?.asText()?.take(5) ?: "en"
                val country = article["country"]
                    ?.takeIf { it.isArray && it.size() > 0 }
                    ?.get(0)?.asText()
                    ?: article["country"]?.asText()

                val eventOccurredAt = parsePubDate(article["pubDate"]?.asText()) ?: nowInstant
                val (category, severity) = inferCategoryAndSeverity(title, description)

                val payloadString = objectMapper.writeValueAsString(article)
                val contentHash = HashUtils.sha256(payloadString)
                if (repository.existsBySourceAndContentHash(source, contentHash)) return@forEach

                collected.add(
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
                        collectedAt = nowInstant,
                        category = category,
                        severityHint = severity,
                        language = language,
                        contentHash = contentHash,
                        rawPayload = article
                    )
                )
            } catch (e: Exception) {
                logger.warn("Skipping NewsData article: ${e.message}")
            }
        }

        logger.info("NewsData collector fetched ${collected.size} signals")
        return collected
    }

    private fun inferCategoryAndSeverity(title: String, description: String?): Pair<SafetyCategory, Severity> {
        val text = (title + " " + (description ?: "")).lowercase()
        return when {
            text.contains("missile") || text.contains("airstrike") || text.contains("air strike") ->
                SafetyCategory.MISSILE_ATTACK to Severity.CRITICAL
            text.contains("war ") || (text.contains("armed") && text.contains("conflict")) ->
                SafetyCategory.ARMED_CONFLICT to Severity.HIGH
            text.contains("terror") || text.contains("bombing") ->
                SafetyCategory.TERRORISM to Severity.HIGH
            text.contains("explosion") || text.contains("blast") ->
                SafetyCategory.EXPLOSION to Severity.HIGH
            text.contains("active shooter") || text.contains("gunman") ->
                SafetyCategory.ACTIVE_SHOOTER to Severity.CRITICAL
            text.contains("mass shooting") || text.contains("shooting") ->
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
            else ->
                SafetyCategory.OTHER to Severity.LOW
        }
    }

    private fun parsePubDate(raw: String?): Instant? {
        if (raw == null) return null
        return try {
            LocalDateTime.parse(raw, pubDateFormatter).toInstant(ZoneOffset.UTC)
        } catch (_: Exception) {
            try { Instant.parse(raw) } catch (_: Exception) { null }
        }
    }
}