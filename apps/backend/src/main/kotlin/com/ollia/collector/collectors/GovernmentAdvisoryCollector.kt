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
import java.time.temporal.ChronoUnit

/**
 * Government travel-advisory collector — multi-country by design.
 *
 * Source: travel-advisory.info, a free, no-key aggregator of official government
 * travel advisories (US State Dept, UK FCDO, etc.) for ~200 countries, each scored
 * 0–5 (higher = more dangerous). We surface only countries above a meaningful
 * threshold as authoritative GOVERNMENT_ALERT signals, tagged with the country so
 * the pipeline shows them to circle members in (or travelling to) that country.
 *
 * Standing advisories change slowly, so we bucket the externalId by day: one fresh
 * signal per country per day keeps the advisory "alive" through expiry without
 * spamming duplicates within a day.
 */
@Component
class GovernmentAdvisoryCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.GOVERNMENT_ALERT
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(10 * 1024 * 1024) }
        .build()

    // Advisory score (0–5) below this is "normal" and never surfaced.
    // 2.5 catches elevated (not just severe) standing advisories for diaspora countries.
    private val minScore = 2.5

    // Advisories change slowly — fetch at most every 3h.
    private val minIntervalMs = 3 * 60 * 60 * 1000L
    private val lastFetchAt = java.util.concurrent.atomic.AtomicLong(0)

    override fun collect(): List<RawSafetyEvent> {
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastFetchAt.get() < minIntervalMs) return emptyList()
        lastFetchAt.set(nowMs)

        val response = try {
            webClient.get()
                // Apex host only — their TLS cert does not cover the www. subdomain.
                .uri("https://travel-advisory.info/api")
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("Travel-advisory fetch failed: ${e.message}")
            return emptyList()
        } ?: return emptyList()

        val data = response["data"] ?: return emptyList()
        val now = Instant.now()
        val dayBucket = now.truncatedTo(ChronoUnit.DAYS)
        val collected = mutableListOf<RawSafetyEvent>()

        data.fields().forEach { (iso, node) ->
            try {
                processCountry(iso, node, now, dayBucket, collected)
            } catch (e: Exception) {
                logger.warn("Skipping advisory for $iso: ${e.message}")
            }
        }

        logger.info("Government advisory collector fetched ${collected.size} signals")
        return collected
    }

    private fun processCountry(
        iso: String,
        node: JsonNode,
        now: Instant,
        dayBucket: Instant,
        collected: MutableList<RawSafetyEvent>,
    ) {
        val name = node["name"]?.asText() ?: return
        val advisory = node["advisory"] ?: return
        val score = advisory["score"]?.asDouble() ?: return
        if (score < minScore) return   // normal — bias toward silence

        val externalId = "advisory:$iso:$dayBucket"
        if (repository.existsBySourceAndExternalId(source, externalId)) return

        val severity = when {
            score >= 4.5 -> Severity.CRITICAL
            score >= 3.5 -> Severity.HIGH
            else         -> Severity.MEDIUM
        }
        val category = if (score >= 4.5) SafetyCategory.TRAVEL_RESTRICTION
                       else SafetyCategory.GOVERNMENT_ADVISORY

        val message = advisory["message"]?.asText()
        val contentHash = HashUtils.sha256("$externalId|$score|${message ?: ""}")
        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collected.add(
            RawSafetyEvent(
                source          = source,
                externalId      = externalId,
                title           = "Travel advisory for $name",
                description     = message?.take(5000),
                sourceUrl       = node["advisory"]?.get("source")?.asText(),
                country         = name,
                city            = null,
                latitude        = null,
                longitude       = null,
                eventOccurredAt = now,
                collectedAt     = now,
                category        = category,
                severityHint    = severity,
                language        = "en",
                contentHash     = contentHash,
                rawPayload      = node,
            )
        )
    }
}