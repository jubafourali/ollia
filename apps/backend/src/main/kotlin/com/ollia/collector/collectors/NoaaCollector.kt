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

@Component
class NoaaCollector(private val objectMapper: ObjectMapper, private val repository: RawSafetySignalRepository) : SafetyCollector {

    companion object {
        private const val NOAA_URL = "https://api.weather.gov/alerts/active?severity=Extreme,Severe"
        private const val PROPERTIES_KEY = "properties"
        private const val ID_KEY = "@id"
        private const val EVENT_KEY = "event"
        private const val HEADLINE_KEY = "headline"
        private const val DESCRIPTION_KEY = "description"
        private const val AREA_DESC_KEY = "areaDesc"
        private const val EFFECTIVE_KEY = "effective"
        private const val SEVERITY_KEY = "severity"
        private const val HURRICANE= "Hurricane"
        private const val TORNADO = "Tornado"
        private const val FLOOD = "Flood"
        private const val FIRE = "Fire"
        private const val TSUNAMI = "Tsunami"
    }

    override val source = SourceType.NOAA
    private val logger = LoggerFactory.getLogger(javaClass)
    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(10 * 1024 * 1024) }
        .build()

    override fun collect(): List<RawSafetyEvent> {
        val response = webClient.get()
            .uri(NOAA_URL)
            .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
            .header("Accept", "application/geo+json")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val features = response["features"] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()
        features.take(50).forEach { feature -> processEvent(feature, now, collectedSignals) }

        logger.info("NOAA collector fetched ${collectedSignals.size} signals")

        return collectedSignals
    }

    private fun processEvent(feature: JsonNode, now: Instant, collectedSignals: MutableList<RawSafetyEvent>) {
        val properties = feature[PROPERTIES_KEY] ?: return
        val externalId = properties[ID_KEY]?.asText()
        if (externalId != null && repository.existsBySourceAndExternalId(source, externalId)) return
        val event = properties[EVENT_KEY]?.asText() ?: return
        val headline = properties[HEADLINE_KEY]?.asText() ?: event
        val description = properties[DESCRIPTION_KEY]?.asText()
        val areaDesc = properties[AREA_DESC_KEY]?.asText()
        val effective = properties[EFFECTIVE_KEY]?.asText()
        val eventOccurredAt = try {
            effective?.let { Instant.parse(it) }
        } catch (_: Exception) {
            now
        }

        val severity = when (properties[SEVERITY_KEY]?.asText()) {
            "Extreme" -> Severity.CRITICAL
            "Severe" -> Severity.HIGH
            "Moderate" -> Severity.MEDIUM
            else -> Severity.LOW
        }

        val category = when {
            event.contains(HURRICANE, true) || event.contains("Tropical", true) -> SafetyCategory.HURRICANE
            event.contains(TORNADO, true) -> SafetyCategory.TORNADO
            event.contains(FLOOD, true) -> SafetyCategory.FLOOD
            event.contains(FIRE, true) || event.contains("Red Flag", true) -> SafetyCategory.WILDFIRE
            event.contains(TSUNAMI, true) -> SafetyCategory.TSUNAMI
            else -> SafetyCategory.EXTREME_WEATHER
        }

        val payloadString = objectMapper.writeValueAsString(feature)
        val contentHash = HashUtils.sha256(payloadString)
        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collectedSignals.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = headline.take(1000),
                description = description?.take(5000),
                sourceUrl = externalId,
                // TODO WHY is this Unites States ?
                country = "United States",
                city = areaDesc?.split(";")?.firstOrNull()?.trim(),
                eventOccurredAt = eventOccurredAt,
                collectedAt = now,
                category = category,
                severityHint = severity,
                language = "en",
                contentHash = contentHash,
                rawPayload = feature
            )
        )
    }
}