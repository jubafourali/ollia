package com.ollia.collector.collectors

import com.ollia.collector.SafetyCollector
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.repository.RawSafetySignalRepository
import com.ollia.util.HashUtils
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ollia.entity.RawSafetyEvent
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.temporal.ChronoUnit

@Component
class GdacsCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.GDACS

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder().build()

    override fun collect(): List<RawSafetyEvent> {

        val url =
            "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH" +
                    "?alertlevel=Green;Orange;Red" +
                    "&eventlist=EQ;TC;FL;VO;WF;DR" +
                    "&fromDate=${
                        Instant.now()
                            .minus(7, ChronoUnit.DAYS)
                            .toString()
                            .substringBefore("T")
                    }"

        val response = webClient.get()
            .uri(url)
            .header("Accept", "application/json")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val features =
            response["features"] ?: return emptyList()

        val now = Instant.now()

        val collectedSignals = mutableListOf<RawSafetyEvent>()

        features.take(30).forEach { feature ->

            val properties =
                feature["properties"]
                    ?: return@forEach

            val geometry =
                feature["geometry"]

            val coordinates =
                geometry?.get("coordinates")

            val eventId =
                properties["eventid"]?.asText()

            val eventType =
                properties["eventtype"]?.asText()

            val externalId =
                "$eventType-$eventId"

            if (
                repository.existsBySourceAndExternalId(
                    source,
                    externalId
                )
            ) {
                return@forEach
            }

            val category =
                when (eventType) {
                    "EQ" -> SafetyCategory.EARTHQUAKE
                    "TC" -> SafetyCategory.HURRICANE
                    "FL" -> SafetyCategory.FLOOD
                    "VO" -> SafetyCategory.VOLCANO
                    "WF" -> SafetyCategory.WILDFIRE
                    "DR" -> SafetyCategory.DROUGHT
                    else -> SafetyCategory.OTHER
                }

            val country =
                properties["country"]?.asText()
                    ?: "Unknown"

            val alertLevel =
                properties["alertlevel"]?.asText()

            val severity =
                when (alertLevel?.lowercase()) {
                    "red" -> Severity.CRITICAL
                    "orange" -> Severity.HIGH
                    "green" -> Severity.MEDIUM
                    else -> Severity.LOW
                }

            val eventOccurredAt =
                try {
                    properties["fromdate"]
                        ?.asText()
                        ?.let {
                            Instant.parse(it)
                        }
                } catch (_: Exception) {
                    now
                }

            val title =
                properties["eventname"]?.asText()
                    ?.takeIf { it.isNotBlank() }
                    ?: country

            val sourceUrl =
                properties["url"]?.asText()
                    ?: "https://www.gdacs.org/report.aspx?eventid=$eventId&eventtype=$eventType"

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
                    description = properties["description"]?.asText(),
                    sourceUrl = sourceUrl,
                    country = country,
                    latitude = coordinates?.get(1)?.asDouble(),
                    longitude = coordinates?.get(0)?.asDouble(),
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
            "GDACS collector fetched ${collectedSignals.size} signals"
        )

        return collectedSignals
    }
}