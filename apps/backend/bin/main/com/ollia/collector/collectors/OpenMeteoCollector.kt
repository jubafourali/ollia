package com.ollia.collector.collectors

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ollia.collector.SafetyCollector
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.geo.PlaceResolver
import com.ollia.repository.RawSafetySignalRepository
import com.ollia.util.HashUtils
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.LocalDate

/**
 * Open-Meteo extreme-conditions probe for diaspora hubs outside US NOAA coverage.
 *
 * Not a full national CAP feed — emits only when observed conditions cross
 * heat / wind / severe storm thresholds so Police can treat it as an instrument.
 */
@Component
class OpenMeteoCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository
) : SafetyCollector {

    override val source = SourceType.OPEN_METEO
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(4 * 1024 * 1024) }
        .build()

    override fun collect(): List<RawSafetyEvent> {
        val now = Instant.now()
        val day = LocalDate.now().toString()
        val collected = mutableListOf<RawSafetyEvent>()

        for ((city, lat, lon) in PlaceResolver.monitoredWeatherCities()) {
            try {
                probeCity(city, lat, lon, day, now, collected)
            } catch (e: Exception) {
                logger.warn("Open-Meteo $city failed: ${e.message}")
            }
        }

        logger.info("Open-Meteo collector fetched ${collected.size} signals")
        return collected
    }

    private fun probeCity(
        city: String,
        lat: Double,
        lon: Double,
        day: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>
    ) {
        val place = PlaceResolver.resolve("$city") ?: return
        val response = webClient.get()
            .uri(
                "https://api.open-meteo.com/v1/forecast" +
                    "?latitude=$lat&longitude=$lon" +
                    "&current=temperature_2m,weather_code,wind_speed_10m" +
                    "&timezone=auto"
            )
            .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
            .retrieve()
            .bodyToMono(JsonNode::class.java)
            .block() ?: return

        val current = response["current"] ?: return
        val temp = current["temperature_2m"]?.asDouble() ?: return
        val wind = current["wind_speed_10m"]?.asDouble() ?: 0.0
        val code = current["weather_code"]?.asInt() ?: 0

        val extreme = classify(temp, wind, code) ?: return

        val externalId = "openmeteo:${city.lowercase()}:$day:${extreme.kind}"
        if (repository.existsBySourceAndExternalId(source, externalId)) return

        val contentHash = HashUtils.sha256(externalId + temp + wind + code)
        if (repository.existsBySourceAndContentHash(source, contentHash)) return

        collected.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = extreme.title.take(1000),
                description = extreme.description.take(5000),
                sourceUrl = "https://open-meteo.com/",
                country = place.country,
                city = city,
                latitude = lat,
                longitude = lon,
                eventOccurredAt = now,
                collectedAt = now,
                category = extreme.category,
                severityHint = extreme.severity,
                language = "en",
                contentHash = contentHash,
                rawPayload = response
            )
        )
    }

    private data class Extreme(
        val kind: String,
        val title: String,
        val description: String,
        val category: SafetyCategory,
        val severity: Severity,
    )

    private fun classify(temp: Double, windKmh: Double, weatherCode: Int): Extreme? {
        // WMO codes: 95–99 thunderstorm; 65/67/82 heavy precip; 86 heavy snow
        if (weatherCode in setOf(95, 96, 99)) {
            return Extreme(
                kind = "storm",
                title = "Severe thunderstorm conditions",
                description = "Open-Meteo reports thunderstorm weather code $weatherCode (wind ${windKmh.toInt()} km/h).",
                category = SafetyCategory.EXTREME_WEATHER,
                severity = if (weatherCode >= 96) Severity.CRITICAL else Severity.HIGH,
            )
        }
        if (weatherCode in setOf(65, 67, 82, 86)) {
            return Extreme(
                kind = "precip",
                title = "Heavy precipitation conditions",
                description = "Open-Meteo reports heavy precipitation code $weatherCode.",
                category = SafetyCategory.FLOOD,
                severity = Severity.HIGH,
            )
        }
        if (temp >= 45.0) {
            return Extreme(
                kind = "heat",
                title = "Extreme heat (${temp.toInt()}°C)",
                description = "Open-Meteo current temperature ${"%.1f".format(temp)}°C exceeds extreme-heat threshold.",
                category = SafetyCategory.EXTREME_WEATHER,
                severity = Severity.CRITICAL,
            )
        }
        if (temp >= 42.0) {
            return Extreme(
                kind = "heat",
                title = "Dangerous heat (${temp.toInt()}°C)",
                description = "Open-Meteo current temperature ${"%.1f".format(temp)}°C.",
                category = SafetyCategory.EXTREME_WEATHER,
                severity = Severity.HIGH,
            )
        }
        if (windKmh >= 90.0) {
            return Extreme(
                kind = "wind",
                title = "Damaging winds (${windKmh.toInt()} km/h)",
                description = "Open-Meteo current wind ${"%.0f".format(windKmh)} km/h.",
                category = SafetyCategory.EXTREME_WEATHER,
                severity = Severity.CRITICAL,
            )
        }
        if (windKmh >= 75.0) {
            return Extreme(
                kind = "wind",
                title = "Very strong winds (${windKmh.toInt()} km/h)",
                description = "Open-Meteo current wind ${"%.0f".format(windKmh)} km/h.",
                category = SafetyCategory.EXTREME_WEATHER,
                severity = Severity.HIGH,
            )
        }
        return null
    }
}
