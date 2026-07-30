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
import org.springframework.web.reactive.function.client.WebClientResponseException
import org.springframework.web.util.UriComponentsBuilder
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * GDACS SEARCH feed — official params use lowercase fromdate / todate
 * (YYYY-MM-DD) and semicolon-separated alertlevel / eventlist.
 * @see https://www.gdacs.org/Documents/2025/GDACS_API_quickstart_v2.pdf
 */
@Component
class GdacsCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository,
) : SafetyCollector {

    companion object {
        private const val GDACS_SEARCH =
            "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
        private const val LOOKBACK_DAYS = 7L
        private const val MAX_FEATURES = 30

        private const val PROPERTIES_KEY = "properties"
        private const val GEOMETRY_KEY = "geometry"
        private const val COORDINATES_KEY = "coordinates"
        private const val EVENT_ID_KEY = "eventid"
        private const val EVENT_TYPE_KEY = "eventtype"
        private const val COUNTRY_KEY = "country"
        private const val ALERT_LEVEL_KEY = "alertlevel"
        private const val DESCRIPTION_KEY = "description"
        private const val FROMDATE_PROP_KEY = "fromdate"
        private const val EVENT_NAME_KEY = "eventname"
        private const val NAME_KEY = "name"

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
        val toDate = LocalDate.now(ZoneOffset.UTC)
        val fromDate = toDate.minusDays(LOOKBACK_DAYS)
        val uri = buildSearchUri(fromDate, toDate)

        val response = try {
            webClient.get()
                .uri(uri)
                .header("Accept", "application/json")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: WebClientResponseException) {
            logger.warn(
                "GDACS SEARCH HTTP {}: {} — uri={}",
                e.statusCode.value(),
                e.responseBodyAsString.take(300),
                uri,
            )
            return emptyList()
        } catch (e: Exception) {
            logger.warn("GDACS SEARCH failed: {}", e.message)
            return emptyList()
        } ?: return emptyList()

        val features = response["features"] ?: return emptyList()
        val now = Instant.now()
        val collectedSignals = mutableListOf<RawSafetyEvent>()

        features.take(MAX_FEATURES).forEach { feature ->
            processEvent(feature, now, collectedSignals)
        }

        logger.info("GDACS collector fetched ${collectedSignals.size} signals")
        return collectedSignals
    }

    /**
     * Build an absolute [URI] via [UriComponentsBuilder] so `;` in alert/event
     * lists is percent-encoded. Passing a raw string to WebClient `.uri(String)`
     * can mangle the query (semicolon / template rules) and yield HTTP 400.
     */
    private fun buildSearchUri(fromDate: LocalDate, toDate: LocalDate): URI =
        UriComponentsBuilder
            .fromHttpUrl(GDACS_SEARCH)
            .queryParam("alertlevel", "Green;Orange;Red")
            .queryParam("eventlist", "EQ;TC;FL;VO;WF;DR")
            .queryParam("fromdate", fromDate.toString())
            .queryParam("todate", toDate.toString())
            .build()
            .encode()
            .toUri()

    private fun processEvent(
        feature: JsonNode,
        now: Instant,
        collectedSignals: MutableList<RawSafetyEvent>,
    ) {
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
                properties[FROMDATE_PROP_KEY]
                    ?.asText()
                    ?.let { Instant.parse(it) }
            } catch (_: Exception) {
                now
            }

        val title =
            properties[EVENT_NAME_KEY]?.asText()?.takeIf { it.isNotBlank() }
                ?: properties[NAME_KEY]?.asText()?.takeIf { it.isNotBlank() }
                ?: country

        // GDACS now returns url as an object: { report, details, geometry }
        val sourceUrl = resolveSourceUrl(properties, eventId, eventType)

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
                rawPayload = feature,
            ),
        )
    }

    private fun resolveSourceUrl(
        properties: JsonNode,
        eventId: String?,
        eventType: String?,
    ): String {
        val urlNode = properties["url"]
        when {
            urlNode == null || urlNode.isNull -> { /* fall through */ }
            urlNode.isTextual -> urlNode.asText().takeIf { it.isNotBlank() }?.let { return it }
            urlNode.isObject -> {
                urlNode["report"]?.asText()?.takeIf { it.isNotBlank() }?.let { return it }
                urlNode["details"]?.asText()?.takeIf { it.isNotBlank() }?.let { return it }
            }
        }
        return "https://www.gdacs.org/report.aspx?eventid=$eventId&eventtype=$eventType"
    }
}
