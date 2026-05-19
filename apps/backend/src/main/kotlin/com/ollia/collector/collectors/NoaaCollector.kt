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
class NoaaCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.NOAA

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs {
            it.defaultCodecs()
                .maxInMemorySize(10 * 1024 * 1024)
        }
        .build()

    private val noaaUrl =
        "https://api.weather.gov/alerts/active?severity=Extreme,Severe"

    override fun collect(): List<RawSafetyEvent> {

        val response = webClient.get()
            .uri(noaaUrl)
            .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
            .header("Accept", "application/geo+json")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val features =
            response["features"] ?: return emptyList()

        val now = Instant.now()

        val collectedSignals = mutableListOf<RawSafetyEvent>()

        features.take(50).forEach { feature ->

            val properties =
                feature["properties"]
                    ?: return@forEach

            val externalId =
                properties["@id"]?.asText()

            if (
                externalId != null &&
                repository.existsBySourceAndExternalId(
                    source,
                    externalId
                )
            ) {
                return@forEach
            }

            val event =
                properties["event"]?.asText()
                    ?: return@forEach

            val headline =
                properties["headline"]?.asText()
                    ?: event

            val description =
                properties["description"]?.asText()

            val areaDesc =
                properties["areaDesc"]?.asText()
                    ?: "United States"

            val effective =
                properties["effective"]?.asText()

            val eventOccurredAt =
                try {
                    effective?.let { Instant.parse(it) }
                } catch (_: Exception) {
                    now
                }

            val severity =
                when (properties["severity"]?.asText()) {
                    "Extreme" -> Severity.CRITICAL
                    "Severe" -> Severity.HIGH
                    "Moderate" -> Severity.MEDIUM
                    else -> Severity.LOW
                }

            val category =
                when {
                    event.contains("Hurricane", true) ||
                            event.contains("Tropical", true) ->
                        SafetyCategory.HURRICANE

                    event.contains("Tornado", true) ->
                        SafetyCategory.TORNADO

                    event.contains("Flood", true) ->
                        SafetyCategory.FLOOD

                    event.contains("Fire", true) ||
                            event.contains("Red Flag", true) ->
                        SafetyCategory.WILDFIRE

                    event.contains("Tsunami", true) ->
                        SafetyCategory.TSUNAMI

                    else ->
                        SafetyCategory.EXTREME_WEATHER
                }

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
                    title = headline.take(1000),
                    description = description?.take(5000),
                    sourceUrl = externalId,
                    country = "United States",
                    city = areaDesc
                        .split(";")
                        .firstOrNull()
                        ?.trim(),
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

        logger.info(
            "NOAA collector fetched ${collectedSignals.size} signals"
        )

        return collectedSignals
    }
}