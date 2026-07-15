package com.ollia.geo

import com.fasterxml.jackson.databind.JsonNode
import com.ollia.dto.CityHolidaySnapshot
import com.ollia.dto.PlaceSituationResponse
import com.ollia.dto.WeatherSnapshot
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Live "being there" snapshot — weather, air, pollen, dust, holidays.
 * Complements verified alerts; never invents crime / street / transit gossip.
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
        val holiday = place?.let { fetchHoliday(it.country) }
        val knowledge = buildKnowledge(weather, holiday)

        val tone = when (worstRisk) {
            "IMPORTANT_DISRUPTION" -> "disrupted"
            "STAY_AWARE" -> "unsettled"
            else -> when {
                weather?.isHarsh == true -> "unsettled"
                (weather?.aqi ?: 0) >= 70 -> "unsettled"
                (weather?.dustUgM3 ?: 0.0) >= 80.0 -> "unsettled"
                (weather?.precipNextHoursMm ?: 0.0) >= 5.0 -> "unsettled"
                weather?.pollenLevel in setOf("high", "very high") -> "unsettled"
                else -> "calm"
            }
        }
        val overall = composeOverall(
            placeLabel = placeLabel,
            weather = weather,
            holiday = holiday,
            knowledge = knowledge,
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
            caveat = "Live city conditions · official instruments for major hazards",
            knowledge = knowledge,
            holiday = holiday,
        )
    }

    private fun buildKnowledge(
        weather: WeatherSnapshot?,
        holiday: CityHolidaySnapshot?,
    ): List<String> {
        val notes = mutableListOf<String>()
        if (holiday != null) {
            when {
                holiday.isToday && !holiday.name.isNullOrBlank() ->
                    notes += "Public holiday today · ${holiday.name}"
                !holiday.nextName.isNullOrBlank() && !holiday.nextDate.isNullOrBlank() -> {
                    val whenLabel = relativeHoliday(holiday.nextDate!!)
                    notes += if (whenLabel != null) "Next holiday $whenLabel · ${holiday.nextName}"
                    else "Next holiday · ${holiday.nextName} (${holiday.nextDate})"
                }
            }
        }
        weather?.pollenLevel?.takeIf { it != "none" && it != "low" }?.let { level ->
            val type = weather.pollenType ?: "Pollen"
            notes += "$type pollen $level"
        }
        weather?.dustLabel?.takeIf { it != "low" && it != "none" }?.let { label ->
            notes += "Dust $label"
        }
        val feels = weather?.feelsLikeC
        val temp = weather?.temperatureC
        if (feels != null && temp != null && feels - temp >= 3.0 && feels >= 32.0) {
            notes += "Feels like ${feels.toInt()}°"
        }
        if ((weather?.uvIndex ?: 0.0) >= 8.0) {
            notes += "High UV (${weather!!.uvIndex!!.toInt()})"
        }
        if ((weather?.precipNextHoursMm ?: 0.0) >= 2.0) {
            notes += "Rain likely · ~${weather!!.precipNextHoursMm!!.toInt()} mm next hours"
        }
        return notes.take(5)
    }

    private fun relativeHoliday(isoDate: String): String? {
        return try {
            val d = LocalDate.parse(isoDate)
            val today = LocalDate.now()
            val days = ChronoUnit.DAYS.between(today, d)
            when {
                days == 0L -> "today"
                days == 1L -> "tomorrow"
                days in 2..6 -> "in ${days}d"
                days in 7..21 -> "in ${(days / 7)}w"
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun composeOverall(
        placeLabel: String,
        weather: WeatherSnapshot?,
        holiday: CityHolidaySnapshot?,
        knowledge: List<String>,
        tone: String,
        alertCount: Int,
        topAlertSentence: String?,
    ): String? {
        if (alertCount > 0 && !topAlertSentence.isNullOrBlank()) {
            return topAlertSentence
        }
        if (weather == null && knowledge.isEmpty()) {
            return when (tone) {
                "calm" -> "No major verified hazards for $placeLabel."
                else -> "Needs attention — see verified alerts."
            }
        }
        // Prefer a present sentence even on calm days — city knowledge, not emptiness.
        if (tone == "calm") {
            // Chips carry knowledge; only lead with holiday-today or a one-liner when no chips.
            if (knowledge.isNotEmpty()) return null
            if (holiday?.isToday == true && !holiday.name.isNullOrBlank()) {
                return "Public holiday · ${holiday.name}"
            }
            weather?.let { return "${it.condition} · ${it.temperatureC.toInt()}°" }
            return null
        }
        val bits = mutableListOf<String>()
        if (weather?.isHarsh == true) bits += weather.condition.lowercase()
        if ((weather?.aqi ?: 0) >= 70) bits += "air quality ${weather?.aqiLabel ?: "elevated"}"
        if ((weather?.dustUgM3 ?: 0.0) >= 50.0) bits += "dust ${weather?.dustLabel ?: "elevated"}"
        if ((weather?.precipNextHoursMm ?: 0.0) >= 5.0) {
            bits += "rain likely (~${weather!!.precipNextHoursMm!!.toInt()} mm)"
        }
        if ((weather?.uvIndex ?: 0.0) >= 8.0) bits += "high UV"
        if (weather?.pollenLevel in setOf("high", "very high")) {
            bits += "${weather!!.pollenType ?: "pollen"} ${weather.pollenLevel}"
        }
        if (bits.isEmpty() && knowledge.isNotEmpty()) return knowledge.take(2).joinToString(" · ")
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
            val feels = current["apparent_temperature"]?.asDouble()
            val daily = forecast["daily"]
            val precipNext = sumNextHours(forecast["hourly"]?.get("precipitation"), hours = 6)
            val uvNow = forecast["hourly"]?.get("uv_index")?.get(0)?.asDouble()

            val aq = fetchAirQuality(lat, lon)

            WeatherSnapshot(
                temperatureC = temp,
                feelsLikeC = feels,
                weatherCode = code,
                condition = WeatherCodes.label(code),
                windKmh = wind,
                humidityPct = current["relative_humidity_2m"]?.asInt(),
                highC = daily?.get("temperature_2m_max")?.get(0)?.asDouble(),
                lowC = daily?.get("temperature_2m_min")?.get(0)?.asDouble(),
                isHarsh = WeatherCodes.isHarsh(code, temp, wind, feels, aq?.dust),
                aqi = aq?.aqi,
                aqiLabel = aq?.aqiLabel,
                pm25 = aq?.pm25,
                precipNextHoursMm = precipNext,
                uvIndex = uvNow,
                dustUgM3 = aq?.dust,
                dustLabel = aq?.dust?.let { WeatherCodes.dustLabel(it) },
                pollenType = aq?.pollenType,
                pollenLevel = aq?.pollenLevel,
                pollenValue = aq?.pollenValue,
            )
        } catch (e: Exception) {
            logger.warn("Open-Meteo situation fetch failed: ${e.message}")
            null
        }
    }

    private data class AirBundle(
        val aqi: Int?,
        val aqiLabel: String?,
        val pm25: Double?,
        val dust: Double?,
        val pollenType: String?,
        val pollenLevel: String?,
        val pollenValue: Double?,
    )

    private fun fetchAirQuality(lat: Double, lon: Double): AirBundle? {
        return try {
            val node = webClient.get()
                .uri(
                    "https://air-quality-api.open-meteo.com/v1/air-quality" +
                        "?latitude=$lat&longitude=$lon" +
                        "&current=european_aqi,pm2_5,dust," +
                        "alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen"
                )
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block() ?: return null
            val current = node["current"] ?: return null
            val aqi = current["european_aqi"]?.asInt()
            val dust = current["dust"]?.asDouble()
            val pollen = WeatherCodes.dominantPollen(current)
            AirBundle(
                aqi = aqi,
                aqiLabel = aqi?.let { WeatherCodes.aqiLabel(it) },
                pm25 = current["pm2_5"]?.asDouble(),
                dust = dust,
                pollenType = pollen?.first,
                pollenLevel = pollen?.second,
                pollenValue = pollen?.third,
            )
        } catch (e: Exception) {
            logger.debug("AQ fetch failed: ${e.message}")
            null
        }
    }

    private fun fetchHoliday(countryName: String): CityHolidaySnapshot? {
        val iso = CountryCodes.iso2(countryName) ?: return null
        return try {
            val list = webClient.get()
                .uri("https://date.nager.at/api/v3/NextPublicHolidays/$iso")
                .header("User-Agent", "OlliaApp/1.0 (safety@ollia.app)")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
            if (list == null || !list.isArray || list.isEmpty) return null
            val today = LocalDate.now().toString()
            val first = list[0]
            val date = first["date"]?.asText() ?: return null
            val name = first["localName"]?.asText() ?: first["name"]?.asText()
            if (date == today) {
                CityHolidaySnapshot(isToday = true, name = name, nextName = name, nextDate = date)
            } else {
                CityHolidaySnapshot(isToday = false, name = null, nextName = name, nextDate = date)
            }
        } catch (e: Exception) {
            logger.debug("Holiday fetch failed for $iso: ${e.message}")
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

/** WMO weather interpretation codes (Open-Meteo) + EAQI / pollen / dust labels. */
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

    fun isHarsh(
        code: Int,
        tempC: Double,
        windKmh: Double,
        feelsLikeC: Double? = null,
        dustUgM3: Double? = null,
    ): Boolean =
        code in setOf(65, 67, 75, 82, 86, 95, 96, 99) ||
            tempC >= 38.0 || tempC <= -10.0 || windKmh >= 60.0 ||
            (feelsLikeC != null && feelsLikeC >= 42.0) ||
            (dustUgM3 != null && dustUgM3 >= 150.0)

    fun aqiLabel(aqi: Int): String = when {
        aqi <= 20 -> "good"
        aqi <= 40 -> "fair"
        aqi <= 60 -> "moderate"
        aqi <= 80 -> "poor"
        aqi <= 100 -> "very poor"
        else -> "hazardous"
    }

    fun dustLabel(dust: Double): String = when {
        dust < 20.0 -> "low"
        dust < 50.0 -> "moderate"
        dust < 100.0 -> "elevated"
        dust < 200.0 -> "high"
        else -> "very high"
    }

    /**
     * Open-Meteo pollen grains/m³ thresholds (approx CAMS-style bands).
     * Returns (type, level, value) for the strongest non-zero species.
     */
    fun dominantPollen(current: JsonNode): Triple<String, String, Double>? {
        val species = listOf(
            "Grass" to (current["grass_pollen"]?.asDouble() ?: 0.0),
            "Birch" to (current["birch_pollen"]?.asDouble() ?: 0.0),
            "Alder" to (current["alder_pollen"]?.asDouble() ?: 0.0),
            "Mugwort" to (current["mugwort_pollen"]?.asDouble() ?: 0.0),
            "Olive" to (current["olive_pollen"]?.asDouble() ?: 0.0),
            "Ragweed" to (current["ragweed_pollen"]?.asDouble() ?: 0.0),
        )
        val best = species.maxByOrNull { it.second } ?: return null
        if (best.second < 1.0) return Triple(best.first, "none", best.second)
        val level = when {
            best.second < 10.0 -> "low"
            best.second < 50.0 -> "moderate"
            best.second < 100.0 -> "high"
            else -> "very high"
        }
        return Triple(best.first, level, best.second)
    }
}

/** Map English country names (resolver) → ISO 3166-1 alpha-2 for Nager.Date. */
object CountryCodes {
    private val MAP = mapOf(
        "france" to "FR",
        "algeria" to "DZ",
        "united arab emirates" to "AE",
        "uae" to "AE",
        "emirates" to "AE",
        "united states" to "US",
        "usa" to "US",
        "united kingdom" to "GB",
        "germany" to "DE",
        "spain" to "ES",
        "italy" to "IT",
        "belgium" to "BE",
        "netherlands" to "NL",
        "morocco" to "MA",
        "tunisia" to "TN",
        "saudi arabia" to "SA",
        "qatar" to "QA",
        "lebanon" to "LB",
        "jordan" to "JO",
        "egypt" to "EG",
        "canada" to "CA",
        "turkey" to "TR",
        "portugal" to "PT",
        "switzerland" to "CH",
        "sweden" to "SE",
        "norway" to "NO",
        "denmark" to "DK",
        "poland" to "PL",
        "greece" to "GR",
        "ireland" to "IE",
        "austria" to "AT",
        "bosnia and herzegovina" to "BA",
        "croatia" to "HR",
        "ukraine" to "UA",
        "japan" to "JP",
        "india" to "IN",
        "australia" to "AU",
        "singapore" to "SG",
        "kenya" to "KE",
        "nigeria" to "NG",
        "south africa" to "ZA",
        "brazil" to "BR",
        "mexico" to "MX",
    )

    fun iso2(country: String): String? {
        val key = country.lowercase().trim()
        MAP[key]?.let { return it }
        return MAP.entries.firstOrNull { key.contains(it.key) || it.key.contains(key) }?.value
    }
}
