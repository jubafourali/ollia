package com.ollia.geo

import com.fasterxml.jackson.databind.JsonNode
import com.ollia.dto.PlaceSituationResponse
import com.ollia.dto.WeatherSnapshot
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant

/**
 * Live "being there" snapshot for a place — current weather + overall tone.
 * Complements verified alerts; never invents crime/local incidents.
 */
@Service
class PlaceSituationService {

    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(2 * 1024 * 1024) }
        .build()

    fun build(
        place: ResolvedPlace?,
        placeLabel: String,
        coverage: CoverageInfo,
        worstRisk: String,
        alertCount: Int,
        topAlertSentence: String?,
    ): PlaceSituationResponse {
        val weather = place?.takeIf { it.hasCoords }?.let { fetchWeather(it.latitude!!, it.longitude!!) }
        val tone = when (worstRisk) {
            "IMPORTANT_DISRUPTION" -> "disrupted"
            "STAY_AWARE" -> "unsettled"
            else -> if (weather?.isHarsh == true) "unsettled" else "calm"
        }
        val overall = composeOverall(
            placeLabel = placeLabel,
            weather = weather,
            tone = tone,
            alertCount = alertCount,
            topAlertSentence = topAlertSentence,
        )
        return PlaceSituationResponse(
            placeLabel = placeLabel,
            country = place?.country ?: coverage.country,
            asOf = Instant.now().toString(),
            weather = weather,
            overall = overall,
            tone = tone,
            instrumentsChecked = coverage.sourcesActive,
            alertCount = alertCount,
            caveat = "Open-Meteo · official instruments only",
        )
    }

    private fun composeOverall(
        placeLabel: String,
        weather: WeatherSnapshot?,
        tone: String,
        alertCount: Int,
        topAlertSentence: String?,
    ): String? {
        if (alertCount > 0 && !topAlertSentence.isNullOrBlank()) {
            return topAlertSentence
        }
        // When weather stats are on screen, stay quiet — the UI shows numbers.
        if (weather != null && tone == "calm") return null
        if (weather != null && tone == "unsettled") {
            return "Notable conditions — watch for verified alerts."
        }
        if (weather != null) return null
        return when (tone) {
            "calm" -> "No major verified hazards for $placeLabel."
            else -> "Needs attention — see verified alerts."
        }
    }

    private fun fetchWeather(lat: Double, lon: Double): WeatherSnapshot? {
        return try {
            val response = webClient.get()
                .uri(
                    "https://api.open-meteo.com/v1/forecast" +
                        "?latitude=$lat&longitude=$lon" +
                        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
                        "&daily=temperature_2m_max,temperature_2m_min" +
                        "&forecast_days=1&timezone=auto"
                )
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block() ?: return null

            val current = response["current"] ?: return null
            val code = current["weather_code"]?.asInt() ?: 0
            val temp = current["temperature_2m"]?.asDouble() ?: return null
            val wind = current["wind_speed_10m"]?.asDouble() ?: 0.0
            val daily = response["daily"]
            WeatherSnapshot(
                temperatureC = temp,
                feelsLikeC = current["apparent_temperature"]?.asDouble(),
                weatherCode = code,
                condition = WeatherCodes.label(code),
                windKmh = wind,
                humidityPct = current["relative_humidity_2m"]?.asInt(),
                highC = daily?.get("temperature_2m_max")?.get(0)?.asDouble(),
                lowC = daily?.get("temperature_2m_min")?.get(0)?.asDouble(),
                isHarsh = WeatherCodes.isHarsh(code, temp, wind),
            )
        } catch (e: Exception) {
            logger.warn("Open-Meteo situation fetch failed: ${e.message}")
            null
        }
    }
}

/** WMO weather interpretation codes (Open-Meteo). */
object WeatherCodes {
    fun label(code: Int): String = when (code) {
        0 -> "Clear sky"
        1 -> "Mainly clear"
        2 -> "Partly cloudy"
        3 -> "Overcast"
        45, 48 -> "Fog"
        51, 53, 55 -> "Drizzle"
        56, 57 -> "Freezing drizzle"
        61, 63, 65 -> "Rain"
        66, 67 -> "Freezing rain"
        71, 73, 75 -> "Snow"
        77 -> "Snow grains"
        80, 81, 82 -> "Rain showers"
        85, 86 -> "Snow showers"
        95 -> "Thunderstorm"
        96, 99 -> "Thunderstorm with hail"
        else -> "Mixed conditions"
    }

    fun isHarsh(code: Int, tempC: Double, windKmh: Double): Boolean =
        code in setOf(65, 67, 75, 82, 86, 95, 96, 99) ||
            tempC >= 38.0 || tempC <= -10.0 || windKmh >= 60.0
}
