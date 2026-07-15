package com.ollia.collector.collectors

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
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
 * MeteoAlarm (EUMETNET) Atom CAP feeds — European severe weather warnings.
 *
 * Official agency alerts (not forecasts). UAE / Algeria are out of footprint;
 * those hubs use [OpenMeteoCollector] instead.
 */
@Component
class MeteoAlarmCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.METEOALARM
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(8 * 1024 * 1024) }
        .build()

    override fun collect(): List<RawSafetyEvent> {
        val now = Instant.now()
        val collected = mutableListOf<RawSafetyEvent>()
        for ((slug, country) in FEEDS) {
            try {
                collectCountry(slug, country, now, collected)
            } catch (e: Exception) {
                logger.warn("MeteoAlarm $slug failed: ${e.message}")
            }
        }
        logger.info("MeteoAlarm collector fetched ${collected.size} signals")
        return collected
    }

    private fun collectCountry(
        slug: String,
        country: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>
    ) {
        val body = webClient.get()
            .uri("https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-$slug")
            .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
            .header("Accept", "application/atom+xml, application/xml, text/xml")
            .retrieve()
            .bodyToMono(String::class.java)
            .block() ?: return

        val entries = ENTRY_REGEX.findAll(body).map { it.groupValues[1] }.toList()
        for (entry in entries.take(40)) {
            try {
                processEntry(entry, country, slug, now, collected)
            } catch (e: Exception) {
                logger.debug("Skip MeteoAlarm entry: ${e.message}")
            }
        }
    }

    private fun processEntry(
        entry: String,
        country: String,
        slug: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>
    ) {
        val title = tag(entry, "title") ?: return
        // Skip "green" / no-awareness noise when labelled
        val awareness = tag(entry, "cap:awareness_level")
            ?: ATTRIBUTE_REGEX.find(entry)?.groupValues?.get(1)
        if (awareness != null && awareness.contains("1", ignoreCase = true) &&
            !title.contains("orange", ignoreCase = true) &&
            !title.contains("red", ignoreCase = true) &&
            !title.contains("yellow", ignoreCase = true)
        ) {
            // Still allow yellow+ via title; green-only entries often say "Green"
            if (title.contains("green", ignoreCase = true) &&
                !title.contains("yellow", ignoreCase = true) &&
                !title.contains("orange", ignoreCase = true) &&
                !title.contains("red", ignoreCase = true)
            ) return
        }

        val id = tag(entry, "id")
            ?: tag(entry, "cap:identifier")
            ?: HashUtils.sha256(title + country).take(32)
        val externalId = "meteoalarm:$slug:$id"
        if (repository.existsBySourceAndExternalId(source, externalId)) return

        val summary = tag(entry, "summary") ?: tag(entry, "cap:description")
        val area = tag(entry, "cap:areaDesc") ?: tag(entry, "georss:where")
        val (lat, lon) = parsePoint(entry)

        val severity = when {
            title.contains("red", ignoreCase = true) -> Severity.CRITICAL
            title.contains("orange", ignoreCase = true) -> Severity.HIGH
            title.contains("yellow", ignoreCase = true) -> Severity.MEDIUM
            else -> Severity.MEDIUM
        }

        val category = when {
            title.contains("flood", ignoreCase = true) ||
                title.contains("rain", ignoreCase = true) -> SafetyCategory.FLOOD
            title.contains("wind", ignoreCase = true) ||
                title.contains("storm", ignoreCase = true) ||
                title.contains("thunder", ignoreCase = true) -> SafetyCategory.EXTREME_WEATHER
            title.contains("snow", ignoreCase = true) ||
                title.contains("ice", ignoreCase = true) ||
                title.contains("frost", ignoreCase = true) -> SafetyCategory.EXTREME_WEATHER
            title.contains("heat", ignoreCase = true) ||
                title.contains("hot", ignoreCase = true) -> SafetyCategory.EXTREME_WEATHER
            title.contains("fire", ignoreCase = true) -> SafetyCategory.WILDFIRE
            else -> SafetyCategory.EXTREME_WEATHER
        }

        val payload: ObjectNode = objectMapper.createObjectNode().apply {
            put("feed", slug)
            put("title", title)
            put("country", country)
            put("area", area)
            put("summary", summary)
        }
        val contentHash = HashUtils.sha256(payload.toString())
        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collected.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = title.take(1000),
                description = (summary ?: area)?.take(5000),
                sourceUrl = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-$slug",
                country = country,
                city = area?.substringBefore(",")?.trim()?.take(120),
                latitude = lat,
                longitude = lon,
                eventOccurredAt = now,
                collectedAt = now,
                category = category,
                severityHint = severity,
                language = "en",
                contentHash = contentHash,
                rawPayload = payload
            )
        )
    }

    private fun tag(xml: String, name: String): String? {
        val re = Regex("""<$name(?:\s[^>]*)?>([\s\S]*?)</$name>""", RegexOption.IGNORE_CASE)
        return re.find(xml)?.groupValues?.get(1)?.replace(Regex("<[^>]+>"), "")?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun parsePoint(entry: String): Pair<Double?, Double?> {
        // georss:point is "lat lon"
        val point = Regex("""<georss:point>([^<]+)</georss:point>""", RegexOption.IGNORE_CASE)
            .find(entry)?.groupValues?.get(1)?.trim()?.split(Regex("\\s+"))
        if (point != null && point.size >= 2) {
            return point[0].toDoubleOrNull() to point[1].toDoubleOrNull()
        }
        val polygon = Regex("""<georss:polygon>([^<]+)</georss:polygon>""", RegexOption.IGNORE_CASE)
            .find(entry)?.groupValues?.get(1)?.trim()?.split(Regex("\\s+"))
        if (polygon != null && polygon.size >= 2) {
            return polygon[0].toDoubleOrNull() to polygon[1].toDoubleOrNull()
        }
        return null to null
    }

    companion object {
        private val ENTRY_REGEX = Regex("""<entry>([\s\S]*?)</entry>""", RegexOption.IGNORE_CASE)
        private val ATTRIBUTE_REGEX = Regex("""awareness[_-]?level["':=\s]+([0-9]+)""", RegexOption.IGNORE_CASE)

        /** High-priority EUMETNET feeds covering Paris and European diaspora cities. */
        private val FEEDS = listOf(
            "france" to "France",
            "germany" to "Germany",
            "spain" to "Spain",
            "italy" to "Italy",
            "belgium" to "Belgium",
            "netherlands" to "Netherlands",
            "austria" to "Austria",
            "switzerland" to "Switzerland",
            "portugal" to "Portugal",
            "greece" to "Greece",
            "bosnia-herzegovina" to "Bosnia and Herzegovina",
            "croatia" to "Croatia",
            "poland" to "Poland",
            "sweden" to "Sweden",
            "norway" to "Norway",
            "denmark" to "Denmark",
            "ireland" to "Ireland",
            "united-kingdom" to "United Kingdom",
        )
    }
}
