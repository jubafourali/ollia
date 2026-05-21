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
class GdacsCollector(private val objectMapper: ObjectMapper, private val repository: RawSafetySignalRepository) : SafetyCollector {

    companion object {
        private const val GDAC_BASE_URL =
            "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH" + "?alertlevel=Green;Orange;Red" + "&eventlist=EQ;TC;FL;VO;WF;DR" + "&fromDate=%s"
        private const val PROPERTIES_KEY = "properties"
        private const val GEOMETRY_KEY = "geometry"
        private const val COORDINATES_KEY = "coordinates"
        private const val EVENT_ID_KEY = "eventid"
        private const val EVENT_TYPE_KEY = "eventtype"
        private const val COUNTRY_KEY = "country"
        private const val ALERT_LEVEL_KEY = "alertlevel"
        private const val DESCRIPTION_KEY = "description"
        private const val FORM_DATA_KEY = "fromdate"
        private const val EVENT_NAME_KEY = "eventname"
        private const val EARTHQUAKE_CATEGORY = "EQ"
        private const val HURRICANE_CATEGORY = "TC"
        private const val FLOOD_CATEGORY = "FL"
        private const val VOLCANO_CATEGORY = "VO"
        private const val WILDFIRE_CATEGORY = "WF"
        private const val DROUGHT_CATEGORY = "DR"
        private const val CRITICAL_SEVERITY_COLOR = "red"
        private const val HIGH_SEVERITY_COLOR = "orange"
        private const val MEDIUM_SEVERITY_COLOR = "green"
    }

    override val source = SourceType.GDACS

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder().build()

    override fun collect(): List<RawSafetyEvent> {

        val url = GDAC_BASE_URL.format(Instant.now().minus(7, ChronoUnit.DAYS).toString().substringBefore("T"))

        val response = webClient.get()
            .uri(url)
            .header("Accept", "application/json")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block()
            ?: return emptyList()

        val features = response["features"] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()

        // TODO check if there is a limit param for the call
        features.take(30).forEach { feature -> processEvent(feature, now, collectedSignals) }

        logger.info("GDACS collector fetched ${collectedSignals.size} signals")

        return collectedSignals
    }

    private fun processEvent(feature: JsonNode, now: Instant, collectedSignals: MutableList<RawSafetyEvent>) {
        val properties = feature[PROPERTIES_KEY] ?: return
        val geometry = feature[GEOMETRY_KEY]
        val coordinates = geometry?.get(COORDINATES_KEY)
        val eventId = properties[EVENT_ID_KEY]?.asText()
        val eventType = properties[EVENT_TYPE_KEY]?.asText()

        val externalId = "$eventType-$eventId"

        if (repository.existsBySourceAndExternalId(source, externalId)) return

        val category = when (eventType) {
            EARTHQUAKE_CATEGORY -> SafetyCategory.EARTHQUAKE
            HURRICANE_CATEGORY -> SafetyCategory.HURRICANE
            FLOOD_CATEGORY -> SafetyCategory.FLOOD
            VOLCANO_CATEGORY -> SafetyCategory.VOLCANO
            WILDFIRE_CATEGORY -> SafetyCategory.WILDFIRE
            DROUGHT_CATEGORY -> SafetyCategory.DROUGHT
            else -> SafetyCategory.OTHER
        }
        val country = properties[COUNTRY_KEY]?.asText() ?: "Unknown"
        val alertLevel = properties[ALERT_LEVEL_KEY]?.asText()
        val severity =
            when (alertLevel?.lowercase()) {
                CRITICAL_SEVERITY_COLOR -> Severity.CRITICAL
                HIGH_SEVERITY_COLOR -> Severity.HIGH
                MEDIUM_SEVERITY_COLOR -> Severity.MEDIUM
                else -> Severity.LOW
            }

        val eventOccurredAt =
            try {
                properties[FORM_DATA_KEY]
                    ?.asText()
                    ?.let {
                        Instant.parse(it)
                    }
            } catch (_: Exception) {
                now
            }

        val title =
            properties[EVENT_NAME_KEY]?.asText()
                ?.takeIf { it.isNotBlank() }
                ?: country

        val sourceUrl =
            properties["url"]?.asText()
                ?: "https://www.gdacs.org/report.aspx?eventid=$eventId&eventtype=$eventType"

        val payloadString = objectMapper.writeValueAsString(feature)

        val contentHash = HashUtils.sha256(payloadString)

        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collectedSignals.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = title,
                description = properties[DESCRIPTION_KEY]?.asText(),
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
}