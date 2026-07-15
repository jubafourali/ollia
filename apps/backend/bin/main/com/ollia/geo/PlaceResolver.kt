package com.ollia.geo

/**
 * Canonical place resolution for SAIAE geo matching.
 *
 * Resolves free-text `"City, Country"` (or bare city) to approx coords + English country name
 * so Algiers / Dubai / Paris (and diaspora peers) match verified events consistently.
 */
data class ResolvedPlace(
    val input: String,
    val city: String?,
    val country: String,
    val latitude: Double?,
    val longitude: Double?,
) {
    val hasCoords: Boolean get() = latitude != null && longitude != null
}

object PlaceResolver {

    /**
     * city key (lowercase) → (lat, lon, English country name)
     * Seeded for expat / diaspora hubs. Prefer matching with country in the region string.
     */
    private val CITIES: Map<String, Triple<Double, Double, String>> = mapOf(
        // Africa
        "nairobi" to Triple(-1.3, 36.8, "Kenya"),
        "lagos" to Triple(6.5, 3.4, "Nigeria"),
        "cairo" to Triple(30.1, 31.2, "Egypt"),
        "algiers" to Triple(36.75, 3.06, "Algeria"),
        "casablanca" to Triple(33.6, -7.6, "Morocco"),
        "accra" to Triple(5.6, -0.2, "Ghana"),
        "dakar" to Triple(14.7, -17.4, "Senegal"),
        "addis ababa" to Triple(9.0, 38.7, "Ethiopia"),
        "johannesburg" to Triple(-26.2, 28.0, "South Africa"),
        "cape town" to Triple(-33.9, 18.4, "South Africa"),
        "tunis" to Triple(36.8, 10.2, "Tunisia"),
        "tripoli" to Triple(32.9, 13.2, "Libya"),
        "khartoum" to Triple(15.6, 32.5, "Sudan"),
        "kampala" to Triple(0.3, 32.6, "Uganda"),
        "dar es salaam" to Triple(-6.8, 39.3, "Tanzania"),
        "oran" to Triple(35.7, -0.6, "Algeria"),
        "constantine" to Triple(36.4, 6.6, "Algeria"),
        // Middle East / Gulf
        "dubai" to Triple(25.2, 55.3, "United Arab Emirates"),
        "abu dhabi" to Triple(24.5, 54.4, "United Arab Emirates"),
        "sharjah" to Triple(25.3, 55.4, "United Arab Emirates"),
        "riyadh" to Triple(24.7, 46.7, "Saudi Arabia"),
        "jeddah" to Triple(21.5, 39.2, "Saudi Arabia"),
        "beirut" to Triple(33.9, 35.5, "Lebanon"),
        "amman" to Triple(31.9, 35.9, "Jordan"),
        "baghdad" to Triple(33.3, 44.4, "Iraq"),
        "damascus" to Triple(33.5, 36.3, "Syria"),
        "tehran" to Triple(35.7, 51.4, "Iran"),
        "tel aviv" to Triple(32.1, 34.8, "Israel"),
        "jerusalem" to Triple(31.8, 35.2, "Israel"),
        "doha" to Triple(25.3, 51.5, "Qatar"),
        "muscat" to Triple(23.6, 58.6, "Oman"),
        "kuwait" to Triple(29.4, 48.0, "Kuwait"),
        "kuwait city" to Triple(29.4, 48.0, "Kuwait"),
        // Europe
        "paris" to Triple(48.86, 2.35, "France"),
        "lyon" to Triple(45.76, 4.84, "France"),
        "marseille" to Triple(43.3, 5.4, "France"),
        "nice" to Triple(43.7, 7.25, "France"),
        "london" to Triple(51.5, -0.12, "United Kingdom"),
        "berlin" to Triple(52.5, 13.4, "Germany"),
        "madrid" to Triple(40.4, -3.7, "Spain"),
        "barcelona" to Triple(41.4, 2.17, "Spain"),
        "rome" to Triple(41.9, 12.5, "Italy"),
        "milan" to Triple(45.5, 9.2, "Italy"),
        "amsterdam" to Triple(52.4, 4.9, "Netherlands"),
        "brussels" to Triple(50.8, 4.4, "Belgium"),
        "vienna" to Triple(48.2, 16.4, "Austria"),
        "zurich" to Triple(47.4, 8.5, "Switzerland"),
        "stockholm" to Triple(59.3, 18.1, "Sweden"),
        "oslo" to Triple(59.9, 10.7, "Norway"),
        "copenhagen" to Triple(55.7, 12.6, "Denmark"),
        "warsaw" to Triple(52.2, 21.0, "Poland"),
        "prague" to Triple(50.1, 14.4, "Czech Republic"),
        "budapest" to Triple(47.5, 19.0, "Hungary"),
        "bucharest" to Triple(44.4, 26.1, "Romania"),
        "athens" to Triple(37.9, 23.7, "Greece"),
        "istanbul" to Triple(41.0, 29.0, "Turkey"),
        "kyiv" to Triple(50.5, 30.5, "Ukraine"),
        "moscow" to Triple(55.8, 37.6, "Russia"),
        "lisbon" to Triple(38.7, -9.1, "Portugal"),
        "sarajevo" to Triple(43.85, 18.4, "Bosnia and Herzegovina"),
        // Asia
        "tokyo" to Triple(35.7, 139.7, "Japan"),
        "beijing" to Triple(39.9, 116.4, "China"),
        "shanghai" to Triple(31.2, 121.5, "China"),
        "delhi" to Triple(28.7, 77.1, "India"),
        "mumbai" to Triple(19.1, 72.9, "India"),
        "karachi" to Triple(24.9, 67.0, "Pakistan"),
        "dhaka" to Triple(23.8, 90.4, "Bangladesh"),
        "kabul" to Triple(34.5, 69.2, "Afghanistan"),
        "islamabad" to Triple(33.7, 73.1, "Pakistan"),
        "bangkok" to Triple(13.8, 100.5, "Thailand"),
        "jakarta" to Triple(-6.2, 106.8, "Indonesia"),
        "singapore" to Triple(1.35, 103.8, "Singapore"),
        "manila" to Triple(14.6, 121.0, "Philippines"),
        "seoul" to Triple(37.6, 127.0, "South Korea"),
        "kuala lumpur" to Triple(3.1, 101.7, "Malaysia"),
        "ho chi minh" to Triple(10.8, 106.7, "Vietnam"),
        // Americas
        "new york" to Triple(40.7, -74.0, "United States"),
        "los angeles" to Triple(34.1, -118.2, "United States"),
        "chicago" to Triple(41.9, -87.6, "United States"),
        "houston" to Triple(29.8, -95.4, "United States"),
        "miami" to Triple(25.8, -80.2, "United States"),
        "toronto" to Triple(43.7, -79.4, "Canada"),
        "montreal" to Triple(45.5, -73.6, "Canada"),
        "vancouver" to Triple(49.3, -123.1, "Canada"),
        "mexico city" to Triple(19.4, -99.1, "Mexico"),
        "bogota" to Triple(4.7, -74.1, "Colombia"),
        "lima" to Triple(-12.1, -77.0, "Peru"),
        "santiago" to Triple(-33.5, -70.7, "Chile"),
        "buenos aires" to Triple(-34.6, -58.4, "Argentina"),
        "sao paulo" to Triple(-23.5, -46.6, "Brazil"),
        "rio de janeiro" to Triple(-22.9, -43.2, "Brazil"),
        // Oceania
        "sydney" to Triple(-33.9, 151.2, "Australia"),
        "melbourne" to Triple(-37.8, 145.0, "Australia"),
        "auckland" to Triple(-36.9, 174.8, "New Zealand"),
    )

    /** Diaspora hubs we poll for Open-Meteo extreme conditions. */
    fun monitoredWeatherCities(): List<Triple<String, Double, Double>> =
        listOf(
            "algiers", "oran", "dubai", "abu dhabi", "paris", "lyon", "marseille",
            "london", "berlin", "madrid", "rome", "istanbul", "cairo", "casablanca",
            "beirut", "amman", "riyadh", "doha", "nairobi", "lagos", "toronto",
            "montreal", "new york", "singapore", "sydney", "sarajevo",
        ).mapNotNull { key ->
            CITIES[key]?.let { Triple(key.replaceFirstChar { c -> c.uppercase() }, it.first, it.second) }
        }

    fun resolve(region: String?): ResolvedPlace? {
        if (region.isNullOrBlank()) return null
        val trimmed = region.trim()
        val cityPart = if (trimmed.contains(",")) trimmed.substringBefore(",").trim() else trimmed
        val countryPart = if (trimmed.contains(",")) trimmed.substringAfterLast(",").trim() else ""

        val cityKey = cityPart.lowercase()
        val hit = CITIES.entries.firstOrNull { (key, _) ->
            cityKey == key || cityKey.contains(key) || key.contains(cityKey)
        } ?: CITIES.entries.firstOrNull { (key, _) ->
            trimmed.lowercase().contains(key)
        }

        val country = when {
            countryPart.isNotBlank() -> countryPart
            hit != null -> hit.value.third
            else -> cityPart // last resort — bare unknown place
        }

        return ResolvedPlace(
            input = trimmed,
            city = cityPart.ifBlank { hit?.key },
            country = country,
            latitude = hit?.value?.first,
            longitude = hit?.value?.second,
        )
    }

    /** Normalize stored profile regions to `"City, Country"` when we can resolve them. */
    fun normalizeRegion(region: String?): String? {
        if (region.isNullOrBlank()) return region
        val resolved = resolve(region) ?: return region.trim()
        val city = resolved.city?.trim().orEmpty()
        if (city.isBlank()) return "${resolved.country}"
        // Avoid "France, France"
        if (city.equals(resolved.country, ignoreCase = true)) return resolved.country
        return "$city, ${resolved.country}"
    }

    fun countryMatches(eventCountry: String?, placeCountry: String): Boolean {
        if (eventCountry.isNullOrBlank() || placeCountry.isBlank()) return false
        val a = eventCountry.lowercase().trim()
        val b = placeCountry.lowercase().trim()
        return a == b || a.contains(b) || b.contains(a) ||
            synonyms(a).any { b.contains(it) || it.contains(b) } ||
            synonyms(b).any { a.contains(it) || it.contains(a) }
    }

    private fun synonyms(country: String): Set<String> = when {
        country.contains("united arab") || country == "uae" || country == "emirates" ->
            setOf("united arab emirates", "uae", "emirates")
        country.contains("united states") || country == "usa" || country == "us" ->
            setOf("united states", "usa", "us", "united states of america")
        country.contains("united kingdom") || country == "uk" || country == "britain" ->
            setOf("united kingdom", "uk", "britain", "great britain")
        else -> setOf(country)
    }
}
