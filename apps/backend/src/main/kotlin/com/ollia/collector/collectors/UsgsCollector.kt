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

    override val source = SourceType.USGS

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder().build()

    private val usgsUrl =
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"

    override fun collect(): List<RawSafetyEvent> {

        val response = webClient
            .get()
            .uri(usgsUrl)
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val features = response["features"]
            ?: return emptyList()

        val now = Instant.now()

        val collectedSignals = mutableListOf<RawSafetyEvent>()

        features.forEach { feature ->

            val properties = feature["properties"]
                ?: return@forEach

            val geometry = feature["geometry"]
                ?: return@forEach

            val coordinates = geometry["coordinates"]

            val externalId = feature["id"]?.asText()

            if (
                externalId != null &&
                repository.existsBySourceAndExternalId(
                    source,
                    externalId
                )
            ) {
                return@forEach
            }

            val magnitude =
                properties["mag"]?.asDouble() ?: 0.0

            val place =
                properties["place"]?.asText()
                    ?: "Unknown location"

            val eventTimeMillis =
                properties["time"]?.asLong()
                    ?: return@forEach

            val sourceUrl =
                properties["url"]?.asText()

            val severity = when {
                magnitude >= 7.0 -> Severity.CRITICAL
                magnitude >= 5.0 -> Severity.HIGH
                magnitude >= 3.0 -> Severity.MEDIUM
                else -> Severity.LOW
            }

            val region = place
                .substringAfter(" of ")
                .trim()
                .ifEmpty { place }

            val title =
                "M${"%.1f".format(magnitude)} Earthquake - $place"

            val description =
                "Magnitude ${"%.1f".format(magnitude)} earthquake near $place"

            val payloadString =
                objectMapper.writeValueAsString(feature)

            val contentHash =
                HashUtils.sha256(payloadString)

            if (
                repository.existsBySourceAndContentHash(
                    source,
                    contentHash
                )
            ) {
                return@forEach
            }

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
                    language = "en",
                    contentHash = contentHash,
                    rawPayload = feature
                )
            )
        }

        logger.info(
            "USGS collector fetched ${collectedSignals.size} signals"
        )

        return collectedSignals
    }
}