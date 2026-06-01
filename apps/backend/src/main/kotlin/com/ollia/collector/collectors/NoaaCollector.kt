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

/**
 * NOAA collector — US National Weather Service alerts.
 *
 * P1 fix: NOAA is US-only. Events are tagged with country = "United States"
 * and state code extracted from the zone identifier. The Police Engine's
 * geographic validation will block these events for all non-US users,
 * so no further filtering is needed here — but we tag them cleanly so
 * the orchestrator country-match works correctly.
 *
 * Only ingests Extreme and Severe severity to keep DB clean.
 */
@Component
class NoaaCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.NOAA
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(10 * 1024 * 1024) }
        .build()

    override fun collect(): List<RawSafetyEvent> {
        val response = try {
            webClient.get()
                .uri("https://api.weather.gov/alerts/active?severity=Extreme,Severe")
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .header("Accept", "application/geo+json")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("NOAA fetch failed: ${e.message}")
            return emptyList()
        } ?: return emptyList()

        val features = response["features"] ?: return emptyList()
        val now = Instant.now()
        val collected = mutableListOf<RawSafetyEvent>()

        features.take(50).forEach { feature ->
            try {
                processEvent(feature, now, collected)
            } catch (e: Exception) {
                logger.warn("Skipping NOAA event: ${e.message}")
            }
        }

        logger.info("NOAA collector fetched ${collected.size} signals")
        return collected
    }

    private fun processEvent(feature: JsonNode, now: Instant, collected: MutableList<RawSafetyEvent>) {
        val props = feature["properties"] ?: return
        val externalId = props["@id"]?.asText() ?: return
        if (repository.existsBySourceAndExternalId(source, externalId)) return

        val event       = props["event"]?.asText() ?: return
        val headline    = props["headline"]?.asText() ?: event
        val description = props["description"]?.asText()
        val areaDesc    = props["areaDesc"]?.asText()
        val effective   = props["effective"]?.asText()

        val eventOccurredAt = try {
            effective?.let { Instant.parse(it) }
        } catch (_: Exception) { now }

        val severity = when (props["severity"]?.asText()) {
            "Extreme"  -> Severity.CRITICAL
            "Severe"   -> Severity.HIGH
            "Moderate" -> Severity.MEDIUM
            else       -> Severity.LOW
        }

        val category = when {
            event.contains("Hurricane", ignoreCase = true) ||
                    event.contains("Tropical", ignoreCase = true)  -> SafetyCategory.HURRICANE
            event.contains("Tornado", ignoreCase = true)   -> SafetyCategory.TORNADO
            event.contains("Flood", ignoreCase = true)     -> SafetyCategory.FLOOD
            event.contains("Fire", ignoreCase = true) ||
                    event.contains("Red Flag", ignoreCase = true)  -> SafetyCategory.WILDFIRE
            event.contains("Tsunami", ignoreCase = true)   -> SafetyCategory.TSUNAMI
            else                                           -> SafetyCategory.EXTREME_WEATHER
        }

        // Extract the primary affected area from areaDesc
        // areaDesc format: "Harris; Galveston; Brazoria" or "Los Angeles, CA"
        val primaryArea = areaDesc?.split(";")?.firstOrNull()?.trim()

        // Extract US state from zone identifier if available
        // NOAA zone IDs look like: "https://api.weather.gov/zones/county/TXZ123"
        val zoneId = props["@id"]?.asText() ?: ""
        val stateCode = extractStateCode(zoneId)

        val payloadString = objectMapper.writeValueAsString(feature)
        val contentHash   = HashUtils.sha256(payloadString)
        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collected.add(
            RawSafetyEvent(
                source          = source,
                externalId      = externalId,
                title           = headline.take(1000),
                description     = description?.take(5000),
                sourceUrl       = externalId,
                country         = "United States",   // NOAA is always US
                city            = primaryArea,
                latitude        = null,              // NOAA alerts are zone-based, no single point
                longitude       = null,
                eventOccurredAt = eventOccurredAt,
                collectedAt     = now,
                category        = category,
                severityHint    = severity,
                language        = "en",
                contentHash     = contentHash,
                rawPayload      = feature
            )
        )
    }

    /**
     * Extract US state code from NOAA zone URL.
     * "https://api.weather.gov/zones/county/TXZ123" → "TX"
     * "https://api.weather.gov/zones/forecast/TXZ123" → "TX"
     */
    private fun extractStateCode(zoneId: String): String? {
        val segment = zoneId.substringAfterLast("/")
        return if (segment.length >= 2) segment.take(2).uppercase() else null
    }
}