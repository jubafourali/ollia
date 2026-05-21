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
class UsgsCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    companion object {
        private const val PROPERTIES_KEY = "properties"
        private const val GEOMETRY_KEY = "geometry"
        private const val COORDINATES_KEY = "coordinates"
        private const val MAG_KEY = "mag"
        private const val PLACE_KEY = "place"
        private const val TIME_KEY = "time"
        private const val URL_KEY = "url"
        private const val FEATURES_KEY = "features"
        // TODO this can be configurable with env vars
        private const val CRITICAL_MAGNITUDE = 7.0
        private const val HIGH_MAGNITUDE = 5.0
        private const val MEDIUM_MAGNITUDE = 3.0
    }

    override val source = SourceType.USGS
    private val logger = LoggerFactory.getLogger(javaClass)
    private val webClient = WebClient.builder().build()
    private val usgsUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
    override fun collect(): List<RawSafetyEvent> {
        val response = webClient
            .get()
            .uri(usgsUrl)
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()
        val features = response[FEATURES_KEY] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()

        features.forEach { feature ->
            val properties = feature[PROPERTIES_KEY] ?: return@forEach
            val geometry = feature[GEOMETRY_KEY] ?: return@forEach
            val coordinates = geometry[COORDINATES_KEY]
            val externalId = feature["id"]?.asText()
            if (externalId != null && repository.existsBySourceAndExternalId(source, externalId)) return@forEach
            val magnitude = properties[MAG_KEY]?.asDouble() ?: 0.0
            val place = properties[PLACE_KEY]?.asText() ?: "Unknown location"
            val eventTimeMillis = properties[TIME_KEY]?.asLong() ?: return@forEach
            val sourceUrl = properties[URL_KEY]?.asText()
            val severity = when {
                magnitude >= CRITICAL_MAGNITUDE -> Severity.CRITICAL
                magnitude >= HIGH_MAGNITUDE -> Severity.HIGH
                magnitude >= MEDIUM_MAGNITUDE -> Severity.MEDIUM
                else -> Severity.LOW
            }

            val region = place.substringAfter(" of ").trim().ifEmpty { place }
            val title = "M${"%.1f".format(magnitude)} Earthquake - $place"
            val description = "Magnitude ${"%.1f".format(magnitude)} earthquake near $place"
            val payloadString = objectMapper.writeValueAsString(feature)
            val contentHash = HashUtils.sha256(payloadString)

            if (repository.existsBySourceAndContentHash(source, contentHash)) return@forEach

            collectedSignals.add(
                RawSafetyEvent(
                    source = source,
                    externalId = externalId,
                    title = title,
                    description = description,
                    sourceUrl = sourceUrl,
                    country = region,
                    latitude = coordinates?.get(1)?.asDouble(),
                    longitude = coordinates?.get(0)?.asDouble(),
                    eventOccurredAt = Instant.ofEpochMilli(eventTimeMillis),
                    collectedAt = now,
                    category = SafetyCategory.EARTHQUAKE,
                    severityHint = severity,
                    // TODO double check the multi language requirements
                    language = "en",
                    contentHash = contentHash,
                    rawPayload = feature
                )
            )
        }
        logger.info("USGS collector fetched ${collectedSignals.size} signals")

        return collectedSignals
    }
}