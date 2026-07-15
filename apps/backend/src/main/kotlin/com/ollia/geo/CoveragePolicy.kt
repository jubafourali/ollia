package com.ollia.geo

/**
 * Honest coverage metadata for a resolved place — what Ollia actually checks.
 */
data class CoverageInfo(
    val country: String,
    val hazardsCovered: List<String>,
    val hazardsNotCovered: List<String>,
    val sourcesActive: List<String>,
    val disclaimer: String,
)

object CoveragePolicy {

    private val alwaysCovered = listOf("earthquake", "major_disaster", "travel_advisory")
    private val neverCovered = listOf("crime", "civil_unrest", "transit", "local_outage")

    fun forPlace(country: String): CoverageInfo {
        val c = country.lowercase()
        val isUs = c.contains("united states") || c == "usa" || c == "us"
        val isEurope = EUROPE.any { c.contains(it) }

        val hazards = alwaysCovered.toMutableList()
        val sources = mutableListOf("USGS", "GDACS", "GOVERNMENT_ALERT")
        val notCovered = neverCovered.toMutableList()

        if (isUs) {
            hazards += "local_weather"
            sources += "NOAA"
        } else {
            // Open-Meteo extreme conditions + MeteoAlarm (Europe)
            hazards += "severe_weather"
            sources += "OPEN_METEO"
            if (isEurope) sources += "METEOALARM"
            notCovered += "local_weather_agency" // national CAP depth varies
        }

        return CoverageInfo(
            country = country,
            hazardsCovered = hazards.distinct(),
            hazardsNotCovered = notCovered.distinct(),
            sourcesActive = sources.distinct(),
            disclaimer = "Ollia checks official disaster and weather-condition sources for this area — not every local incident.",
        )
    }

    fun checkedAndClearSummary(placeLabel: String, coverage: CoverageInfo): String {
        val sources = coverage.sourcesActive.take(3).joinToString(", ")
        return "Checked $sources for $placeLabel — no verified alerts match right now. " +
            "Ollia does not monitor crime or every local incident."
    }

    private val EUROPE = listOf(
        "france", "germany", "spain", "italy", "united kingdom", "belgium",
        "netherlands", "austria", "switzerland", "sweden", "norway", "denmark",
        "poland", "portugal", "greece", "ireland", "czech", "hungary", "romania",
        "bosnia", "croatia", "serbia", "ukraine", "turkey",
    )
}
