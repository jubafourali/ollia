package com.ollia.geo

import com.fasterxml.jackson.databind.JsonNode
import com.ollia.dto.PlaceSituationResponse
import com.ollia.dto.WeatherSnapshot
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant

/**
 * Live "being there" snapshot — weather, air quality, precip, UV.
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
            else -> when {
                weather?.isHarsh == true -> "unsettled"
                (weather?.aqi ?: 0) >= 70 -> "unsettled"
                (weather?.precipNextHoursMm ?: 0.0) >= 5.0 -> "unsettled"
                else -> "calm"
            }
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
            caveat = "Live conditions · official instruments for hazards",
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
        if (weather == null) {
            return when (tone) {
                "calm" -> "No major verified hazards for $placeLabel."
                else -> "Needs attention — see verified alerts."
            }
        }
        if (tone == "calm") return null
        val bits = mutableListOf<String>()
        if (weather.isHarsh) bits += weather.condition.lowercase()
        if ((weather.aqi ?: 0) >= 70) bits += "air quality ${weather.aqiLabel ?: "elevated"}"
        if ((weather.precipNextHoursMm ?: 0.0) >= 5.0) {
            bits += "rain likely (~${weather.precipNextHoursMm!!.toInt()} mm)"
        }
        if ((weather.uvIndex ?: 0.0) >= 8.0) bits += "high UV"
        return if (bits.isEmpty()) "Notable conditions — watch for verified alerts."
        else bits.joinToString(" · ").replaceFirstChar { it.uppercase() }
    }

    private fun fetchWeather(lat: Double, lon: Double): WeatherSnapshot? {
        return try {
            val forecast = webClient.get()
                .uri(
                    "https://api.open-meteo.com/v1/forecast" +
                        "?latitude=$lat&longitude=$lon" +
                        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
                        "&hourly=precipitation,uv_index" +
                        "&daily=temperature_2m_max,temperature_2m_min" +
                        "&forecast_days=1&timezone=auto"
                )
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block() ?: return null

            val current = forecast["current"] ?: return null
            val code = current["weather_code"]?.asInt() ?: 0
            val temp = current["temperature_2m"]?.asDouble() ?: return null
            val wind = current["wind_speed_10m"]?.asDouble() ?: 0.0
            val daily = forecast["daily"]
            val precipNext = sumNextHours(forecast["hourly"]?.get("precipitation"), hours = 6)
            val uvNow = forecast["hourly"]?.get("uv_index")?.get(0)?.asDouble()

            val aq = fetchAirQuality(lat, lon)

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
                aqi = aq?.first,
                aqiLabel = aq?.second,
                pm25 = aq?.third,
                precipNextHoursMm = precipNext,
                uvIndex = uvNow,
            )
        } catch (e: Exception) {
            logger.warn("Open-Meteo situation fetch failed: ${e.message}")
            null
        }
    }

    private fun fetchAirQuality(lat: Double, lon: Double): Triple<Int, String, Double?>? {
        return try {
            val node = webClient.get()
                .uri(
                    "https://air-quality-api.open-meteo.com/v1/air-quality" +
                        "?latitude=$lat&longitude=$lon&current=european_aqi,pm2_5"
                )
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block() ?: return null
            val current = node["current"] ?: return null
            val aqi = current["european_aqi"]?.asInt() ?: return null
            Triple(aqi, WeatherCodes.aqiLabel(aqi), current["pm2_5"]?.asDouble())
        } catch (e: Exception) {
            logger.debug("AQ fetch failed: ${e.message}")
            null
        }
    }

    private fun sumNextHours(arr: JsonNode?, hours: Int): Double? {
        if (arr == null || !arr.isArray) return null
        var sum = 0.0
        val n = minOf(hours, arr.size())
        for (i in 0 until n) {
            sum += arr[i]?.asDouble() ?: 0.0
        }
        return sum
    }
}

/** WMO weather interpretation codes (Open-Meteo) + EAQI labels. */
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

    fun aqiLabel(aqi: Int): String = when {
        aqi <= 20 -> "good"
        aqi <= 40 -> "fair"
        aqi <= 60 -> "moderate"
        aqi <= 80 -> "poor"
        aqi <= 100 -> "very poor"
        else -> "hazardous"
    }
}
