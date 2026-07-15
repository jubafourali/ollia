package com.ollia.dto

/**
 * Region-scoped safety feed for the "Nearby" screen.
 *
 * Unlike [NearbyMemberResponse] (grouped per circle member), this answers
 * "what's happening around *this place* right now?" for an arbitrary region the
 * user is browsing. The banner reads [worstRisk] + [summary]; the feed reads [events].
 * [coverage] is honest about what Ollia actually checks here (ICP city packs).
 */
data class NearbyRegionResponse(
    val region:    String,
    val worstRisk: String,   // NORMAL | STAY_AWARE | IMPORTANT_DISRUPTION
    val summary:   String,   // calm smart-summary sentence for the safety banner
    val events:    List<NearbyEventResponse>,
    val coverage:  CoverageResponse? = null,
    /** Live place snapshot — weather + city knowledge ("being there"). */
    val situation: PlaceSituationResponse? = null,
)

data class PlaceSituationResponse(
    val placeLabel: String,
    val country: String?,
    val asOf: String,
    val weather: WeatherSnapshot?,
    /** Null when weather UI already says enough. */
    val overall: String?,
    /** calm | unsettled | disrupted */
    val tone: String,
    val instrumentsChecked: List<String>,
    val alertCount: Int,
    val caveat: String,
    /**
     * Short city-knowledge lines (holiday, pollen, dust, heat) — instrument/calendar
     * backed, never crime or street gossip.
     */
    val knowledge: List<String> = emptyList(),
    val holiday: CityHolidaySnapshot? = null,
)

data class CityHolidaySnapshot(
    /** Today is a public holiday. */
    val isToday: Boolean,
    val name: String?,
    /** Next upcoming holiday if not today (local name preferred). */
    val nextName: String? = null,
    val nextDate: String? = null,
)

data class WeatherSnapshot(
    val temperatureC: Double,
    val feelsLikeC: Double? = null,
    val weatherCode: Int,
    val condition: String,
    val windKmh: Double,
    val humidityPct: Int? = null,
    val highC: Double? = null,
    val lowC: Double? = null,
    val isHarsh: Boolean = false,
    /** European AQI if available. */
    val aqi: Int? = null,
    val aqiLabel: String? = null,
    val pm25: Double? = null,
    /** Next-hours precipitation sum (mm). */
    val precipNextHoursMm: Double? = null,
    val uvIndex: Double? = null,
    /** Dust concentration µg/m³ (Open-Meteo) — useful for Maghreb / Gulf. */
    val dustUgM3: Double? = null,
    val dustLabel: String? = null,
    /** Dominant pollen type + level when above quiet. */
    val pollenType: String? = null,
    val pollenLevel: String? = null,
    val pollenValue: Double? = null,
)

data class CoverageResponse(
    val country: String,
    val packId: String,
    val packLabel: String,
    val promise: String,
    val hazardsCovered: List<String>,
    val hazardsNotCovered: List<String>,
    val coveredLabels: List<String>,
    val notCoveredLabels: List<String>,
    val gapChips: List<String> = emptyList(),
    val sourcesActive: List<String>,
    val disclaimer: String,
)
