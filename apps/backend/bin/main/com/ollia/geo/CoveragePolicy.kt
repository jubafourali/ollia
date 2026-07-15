package com.ollia.geo

/**
 * Honest coverage metadata for a resolved place — what Ollia actually checks.
 *
 * ICP city packs (France / Algeria / UAE) get explicit covered vs not-covered labels
 * so quiet never implies omniscience.
 */
data class CoverageInfo(
    val country: String,
    /** france | algeria | uae | united_states | europe | global */
    val packId: String,
    val packLabel: String,
    /** One-line promise the UI can surface. */
    val promise: String,
    val hazardsCovered: List<String>,
    val hazardsNotCovered: List<String>,
    /** Human labels for covered hazards (Nearby / Settings). */
    val coveredLabels: List<String>,
    /** Human labels for gaps. */
    val notCoveredLabels: List<String>,
    /** Short chips shown above the fold — what we do not claim. */
    val gapChips: List<String>,
    val sourcesActive: List<String>,
    val disclaimer: String,
)

object CoveragePolicy {

    private val alwaysKeys = listOf("earthquake", "major_disaster", "travel_advisory")
    private val neverKeys = listOf("crime", "civil_unrest", "street_incident", "local_gossip")

    private val alwaysLabels = listOf(
        "Earthquakes (USGS)",
        "Major disasters (GDACS)",
        "Serious travel / government advisories",
    )
    private val neverLabels = listOf(
        "Crime & policing",
        "Protests / civil unrest (unless official)",
        "Street-level or neighborhood incidents",
        "Rumor & unverified news",
    )

    private const val PROMISE =
        "When something major and verified happens near people you love, Ollia usually catches it from trustworthy sources. Quiet means those sources were checked — not that nothing happened on earth."

    private const val PROMISE_SHORT =
        "Quiet means instruments were checked — not that nothing happened locally."

    fun forPlace(country: String): CoverageInfo {
        val c = country.lowercase().trim()
        return when {
            matches(c, "france") -> francePack(country.ifBlank { "France" })
            matches(c, "algeria", "algérie", "algerie") -> algeriaPack(country.ifBlank { "Algeria" })
            matches(c, "united arab emirates", "uae", "emirates") ->
                uaePack(country.ifBlank { "United Arab Emirates" })
            matches(c, "united states", "usa") || c == "us" ->
                usPack(country.ifBlank { "United States" })
            EUROPE.any { c.contains(it) } -> europePack(country)
            else -> globalPack(country.ifBlank { "this area" })
        }
    }

    fun checkedAndClearSummary(placeLabel: String, coverage: CoverageInfo): String {
        val sources = coverage.sourcesActive.joinToString(", ")
        return "No major verified alerts for $placeLabel. Checked: $sources."
    }

    private fun francePack(country: String) = CoverageInfo(
        country = country,
        packId = "france",
        packLabel = "France coverage pack",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("severe_weather", "flood_warning"),
        hazardsNotCovered = neverKeys + listOf("full_national_cap_depth"),
        coveredLabels = alwaysLabels + listOf(
            "Severe weather warnings (MeteoAlarm / EUMETNET)",
            "Extreme heat / storm / wind (Open-Meteo thresholds)",
        ),
        notCoveredLabels = neverLabels + listOf(
            "Every Météo-France municipal advisory",
            "Metro / RATP disruptions",
        ),
        gapChips = listOf("Crime", "Street-level", "Metro / RATP", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "METEOALARM", "OPEN_METEO"),
        disclaimer = "France pack: major disasters, official European weather warnings, and advisories — not crime or every local incident in Paris.",
    )

    private fun algeriaPack(country: String) = CoverageInfo(
        country = country,
        packId = "algeria",
        packLabel = "Algeria coverage pack",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("severe_weather"),
        hazardsNotCovered = neverKeys + listOf("national_weather_agency", "local_security_bulletin"),
        coveredLabels = alwaysLabels + listOf(
            "Extreme heat / storm / wind (Open-Meteo thresholds)",
        ),
        notCoveredLabels = neverLabels + listOf(
            "ONM / national CAP weather depth (not fully wired yet)",
            "Local security or municipal bulletins",
        ),
        gapChips = listOf("Crime", "Full ONM CAP", "Local security", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "OPEN_METEO"),
        disclaimer = "Algeria pack: major disasters, extreme-condition probes, and advisories — not street crime or full national weather CAP yet.",
    )

    private fun uaePack(country: String) = CoverageInfo(
        country = country,
        packId = "uae",
        packLabel = "UAE coverage pack",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("severe_weather"),
        hazardsNotCovered = neverKeys + listOf("ncm_full_feed", "local_security_bulletin"),
        coveredLabels = alwaysLabels + listOf(
            "Extreme heat / storm / wind (Open-Meteo thresholds)",
        ),
        notCoveredLabels = neverLabels + listOf(
            "Full UAE NCM alert feed (not fully wired yet)",
            "Local municipal or traffic incidents",
        ),
        gapChips = listOf("Crime", "Full NCM feed", "Traffic incidents", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "OPEN_METEO"),
        disclaimer = "UAE pack: major disasters, extreme-condition probes, and advisories — not NCM full depth or every Dubai local incident.",
    )

    private fun usPack(country: String) = CoverageInfo(
        country = country,
        packId = "united_states",
        packLabel = "United States coverage",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("local_weather"),
        hazardsNotCovered = neverKeys,
        coveredLabels = alwaysLabels + listOf("US severe weather (NOAA / NWS)"),
        notCoveredLabels = neverLabels,
        gapChips = listOf("Crime", "Street-level", "Protests", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "NOAA"),
        disclaimer = "US coverage includes NOAA weather. Still not crime or every local incident.",
    )

    private fun europePack(country: String) = CoverageInfo(
        country = country,
        packId = "europe",
        packLabel = "Europe coverage",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("severe_weather"),
        hazardsNotCovered = neverKeys + listOf("full_national_cap_depth"),
        coveredLabels = alwaysLabels + listOf(
            "Severe weather warnings (MeteoAlarm)",
            "Extreme-condition probes (Open-Meteo)",
        ),
        notCoveredLabels = neverLabels + listOf("Every national municipal weather advisory"),
        gapChips = listOf("Crime", "Street-level", "Protests", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "METEOALARM", "OPEN_METEO"),
        disclaimer = "European coverage: disasters + MeteoAlarm weather warnings — not crime or street-level news.",
    )

    private fun globalPack(country: String) = CoverageInfo(
        country = country,
        packId = "global",
        packLabel = "Global baseline coverage",
        promise = PROMISE_SHORT,
        hazardsCovered = alwaysKeys + listOf("severe_weather"),
        hazardsNotCovered = neverKeys + listOf("local_weather_agency"),
        coveredLabels = alwaysLabels + listOf("Extreme-condition probes where we monitor hubs (Open-Meteo)"),
        notCoveredLabels = neverLabels + listOf("Local national weather CAP (varies by country)"),
        gapChips = listOf("Crime", "Street-level", "Local CAP gaps", "Rumors"),
        sourcesActive = listOf("USGS", "GDACS", "GOVERNMENT_ALERT", "OPEN_METEO"),
        disclaimer = "Baseline: major disasters and advisories. Local weather depth varies — quiet is not omniscience.",
    )

    private fun matches(country: String, vararg needles: String) =
        needles.any { country == it || country.contains(it) }

    private val EUROPE = listOf(
        "germany", "spain", "italy", "united kingdom", "belgium",
        "netherlands", "austria", "switzerland", "sweden", "norway", "denmark",
        "poland", "portugal", "greece", "ireland", "czech", "hungary", "romania",
        "bosnia", "croatia", "serbia", "ukraine", "turkey",
    )
}
