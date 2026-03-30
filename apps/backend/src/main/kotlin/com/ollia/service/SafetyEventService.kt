package com.ollia.service

import com.ollia.entity.SafetyEvent
import com.ollia.repository.SafetyEventRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.atomic.AtomicReference

@Service
class SafetyEventService(
    private val safetyEventRepository: SafetyEventRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val webClient = WebClient.builder().build()
    private val lastFetch = AtomicReference<Instant>(Instant.EPOCH)

    fun getEvents(region: String? = null): List<SafetyEvent> {
        val since = Instant.now().minus(24, ChronoUnit.HOURS)
        return if (region != null) {
            safetyEventRepository.findAllByRegionIgnoreCaseAndFetchedAtAfterOrderByEventTimeDesc(region, since)
        } else {
            safetyEventRepository.findAllByFetchedAtAfterOrderByEventTimeDesc(since)
        }
    }

    @Scheduled(fixedRate = 900_000) // every 15 minutes
    fun fetchAllSources() {
        val now = Instant.now()
        if (java.time.Duration.between(lastFetch.get(), now).toMinutes() < 14) return
        lastFetch.set(now)

        logger.info("Fetching safety events from all sources")
        fetchUsgsEarthquakes()
        fetchNoaaAlerts()
        fetchGdacsEvents()
        cleanupOldEvents()
    }

    private fun fetchUsgsEarthquakes() {
        try {
            val url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson"
            val response = webClient.get().uri(url).retrieve()
                .bodyToMono(Map::class.java).block() ?: return

            @Suppress("UNCHECKED_CAST")
            val features = response["features"] as? List<Map<String, Any>> ?: return
            val now = Instant.now()

            for (feature in features) {
                @Suppress("UNCHECKED_CAST")
                val properties = feature["properties"] as? Map<String, Any> ?: continue
                @Suppress("UNCHECKED_CAST")
                val geometry = feature["geometry"] as? Map<String, Any> ?: continue
                @Suppress("UNCHECKED_CAST")
                val coordinates = geometry["coordinates"] as? List<Number> ?: continue

                val magnitude = (properties["mag"] as? Number)?.toDouble() ?: 0.0
                val place = properties["place"] as? String ?: "Unknown location"
                val time = (properties["time"] as? Number)?.toLong() ?: continue
                val detailUrl = properties["url"] as? String

                val severity = when {
                    magnitude >= 7.0 -> "critical"
                    magnitude >= 5.0 -> "high"
                    magnitude >= 3.0 -> "medium"
                    else -> "low"
                }

                val region = place.substringAfter(" of ").trim().ifEmpty { place }

                safetyEventRepository.save(
                    SafetyEvent(
                        type = "earthquake",
                        title = "M${"%.1f".format(magnitude)} Earthquake - $place",
                        description = "A magnitude ${"%.1f".format(magnitude)} earthquake occurred near $place",
                        region = region,
                        severity = severity,
                        source = "USGS",
                        sourceUrl = detailUrl,
                        lat = coordinates.getOrNull(1)?.toDouble(),
                        lon = coordinates.getOrNull(0)?.toDouble(),
                        eventTime = Instant.ofEpochMilli(time),
                        fetchedAt = now
                    )
                )
            }
            logger.info("Fetched ${features.size} events from USGS")
        } catch (e: Exception) {
            logger.error("Failed to fetch USGS earthquakes", e)
        }
    }

    private fun fetchNoaaAlerts() {
        try {
            val url = "https://api.weather.gov/alerts/active?severity=Extreme,Severe"
            val response = webClient.get().uri(url)
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .header("Accept", "application/geo+json")
                .retrieve()
                .bodyToMono(Map::class.java).block() ?: return

            @Suppress("UNCHECKED_CAST")
            val features = response["features"] as? List<Map<String, Any>> ?: return
            val now = Instant.now()
            var count = 0

            for (feature in features.take(50)) { // limit to 50 most relevant
                @Suppress("UNCHECKED_CAST")
                val properties = feature["properties"] as? Map<String, Any> ?: continue

                val event = properties["event"] as? String ?: continue
                val headline = properties["headline"] as? String ?: event
                val description = properties["description"] as? String
                val severity = when (properties["severity"] as? String) {
                    "Extreme" -> "critical"
                    "Severe" -> "high"
                    "Moderate" -> "medium"
                    else -> "low"
                }
                val areaDesc = properties["areaDesc"] as? String ?: "United States"
                val effective = properties["effective"] as? String
                val eventTime = if (effective != null) {
                    try { Instant.parse(effective) } catch (_: Exception) { now }
                } else now

                val eventType = when {
                    event.contains("Hurricane", true) || event.contains("Tropical", true) -> "hurricane"
                    event.contains("Tornado", true) -> "tornado"
                    event.contains("Flood", true) -> "flood"
                    event.contains("Fire", true) || event.contains("Red Flag", true) -> "wildfire"
                    event.contains("Tsunami", true) -> "tsunami"
                    event.contains("Winter", true) || event.contains("Blizzard", true) -> "winter_storm"
                    else -> "weather"
                }

                safetyEventRepository.save(
                    SafetyEvent(
                        type = eventType,
                        title = headline.take(500),
                        description = description?.take(2000),
                        region = areaDesc.split(";").firstOrNull()?.trim() ?: areaDesc,
                        severity = severity,
                        source = "NOAA",
                        sourceUrl = properties["@id"] as? String,
                        eventTime = eventTime,
                        fetchedAt = now
                    )
                )
                count++
            }
            logger.info("Fetched $count events from NOAA")
        } catch (e: Exception) {
            logger.error("Failed to fetch NOAA alerts", e)
        }
    }

    private fun fetchGdacsEvents() {
        try {
            val url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=Green;Orange;Red&eventlist=EQ;TC;FL;VO;WF;DR&fromDate=${
                Instant.now().minus(7, ChronoUnit.DAYS).toString().substringBefore("T")
            }"
            val response = webClient.get().uri(url)
                .header("Accept", "application/json")
                .retrieve()
                .bodyToMono(Map::class.java).block() ?: return

            @Suppress("UNCHECKED_CAST")
            val features = response["features"] as? List<Map<String, Any>> ?: return
            val now = Instant.now()
            var count = 0

            for (feature in features.take(30)) {
                @Suppress("UNCHECKED_CAST")
                val properties = feature["properties"] as? Map<String, Any> ?: continue
                @Suppress("UNCHECKED_CAST")
                val geometry = feature["geometry"] as? Map<String, Any>
                @Suppress("UNCHECKED_CAST")
                val coordinates = geometry?.get("coordinates") as? List<Number>

                val eventType = when (properties["eventtype"] as? String) {
                    "EQ" -> "earthquake"
                    "TC" -> "hurricane"
                    "FL" -> "flood"
                    "VO" -> "volcano"
                    "WF" -> "wildfire"
                    "DR" -> "drought"
                    else -> "disaster"
                }
                val name = (properties["eventname"] as? String ?: properties["name"] as? String ?: "").trim()
                val country = (properties["country"] as? String ?: "Unknown").trim()
                val alertLevel = properties["alertlevel"] as? String
                val severity = when (alertLevel?.lowercase()) {
                    "red" -> "critical"
                    "orange" -> "high"
                    "green" -> "medium"
                    else -> "low"
                }
                val dateStr = properties["fromdate"] as? String
                val eventTime = if (dateStr != null) {
                    try { Instant.parse(dateStr) } catch (_: Exception) { now }
                } else now

                val gdacsUrl = properties["url"] as? String
                    ?: "https://www.gdacs.org/report.aspx?eventid=${properties["eventid"]}&eventtype=${properties["eventtype"]}"

                val gdacsTitle = if (name.isBlank()) country else "$name - $country"

                safetyEventRepository.save(
                    SafetyEvent(
                        type = eventType,
                        title = gdacsTitle,
                        description = properties["description"] as? String,
                        region = country,
                        severity = severity,
                        source = "GDACS",
                        sourceUrl = gdacsUrl,
                        lat = coordinates?.getOrNull(1)?.toDouble(),
                        lon = coordinates?.getOrNull(0)?.toDouble(),
                        eventTime = eventTime,
                        fetchedAt = now
                    )
                )
                count++
            }
            logger.info("Fetched $count events from GDACS")
        } catch (e: Exception) {
            logger.error("Failed to fetch GDACS events", e)
        }
    }

    @Transactional
    private fun cleanupOldEvents() {
        val cutoff = Instant.now().minus(48, ChronoUnit.HOURS)
        safetyEventRepository.deleteAllByFetchedAtBefore(cutoff)
    }

}
