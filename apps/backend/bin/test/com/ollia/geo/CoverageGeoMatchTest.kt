package com.ollia.geo

import com.ollia.util.GeoUtils
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Fixtures for diaspora hubs (Paris / Dubai / Algiers): place resolution +
 * geo match rules. NOAA US-tagged events must not match these countries.
 */
class CoverageGeoMatchTest {

    private data class FixtureEvent(
        val country: String?,
        val latitude: Double?,
        val longitude: Double?,
        val isWar: Boolean = false,
    )

    private data class GeoMatch(val distanceKm: Double, val proximityKnown: Boolean)

    /** Mirrors NearbyController.computeDistance rules. */
    private fun match(
        event: FixtureEvent,
        userCoords: Pair<Double, Double>?,
        userCountry: String,
    ): GeoMatch? {
        return when {
            event.latitude != null && event.longitude != null && userCoords != null -> {
                val dist = GeoUtils.haversineKm(
                    userCoords.first, userCoords.second,
                    event.latitude, event.longitude
                )
                if (dist <= 500.0 || event.isWar) GeoMatch(dist, true) else null
            }
            event.country != null && userCountry.isNotBlank() -> {
                val same = PlaceResolver.countryMatches(event.country, userCountry)
                if (same || event.isWar) GeoMatch(150.0, false) else null
            }
            event.isWar -> GeoMatch(500.0, false)
            else -> null
        }
    }

    @Test
    fun `Paris France resolves with coords`() {
        val p = PlaceResolver.resolve("Paris, France")
        assertNotNull(p)
        assertEquals("France", p.country)
        assertTrue(p.hasCoords)
        assertTrue(GeoUtils.haversineKm(p.latitude!!, p.longitude!!, 48.86, 2.35) < 5.0)
    }

    @Test
    fun `bare Paris still resolves country via PlaceResolver`() {
        val p = PlaceResolver.resolve("Paris")
        assertNotNull(p)
        assertEquals("France", p.country)
        assertTrue(p.hasCoords)
        assertEquals("Paris, France", PlaceResolver.normalizeRegion("Paris"))
    }

    @Test
    fun `Dubai resolves United Arab Emirates`() {
        val p = PlaceResolver.resolve("Dubai, United Arab Emirates")
        assertNotNull(p)
        assertTrue(PlaceResolver.countryMatches(p.country, "United Arab Emirates"))
        assertTrue(p.hasCoords)
    }

    @Test
    fun `Algiers resolves Algeria`() {
        val p = PlaceResolver.resolve("Algiers, Algeria")
        assertNotNull(p)
        assertEquals("Algeria", p.country)
        assertTrue(p.hasCoords)
    }

    @Test
    fun `USGS-style quake near Paris matches Paris user`() {
        val place = PlaceResolver.resolve("Paris, France")!!
        val coords = place.latitude!! to place.longitude!!
        val quake = FixtureEvent(
            country = "France",
            latitude = 48.9,
            longitude = 2.4,
        )
        val hit = match(quake, coords, place.country)
        assertNotNull(hit)
        assertTrue(hit.proximityKnown)
        assertTrue(hit.distanceKm < 50.0)
    }

    @Test
    fun `GDACS-style disaster near Dubai matches Dubai user`() {
        val place = PlaceResolver.resolve("Dubai, United Arab Emirates")!!
        val coords = place.latitude!! to place.longitude!!
        val disaster = FixtureEvent(
            country = "United Arab Emirates",
            latitude = 25.1,
            longitude = 55.2,
        )
        assertNotNull(match(disaster, coords, place.country))
    }

    @Test
    fun `Algiers coords match quake within 500km`() {
        val place = PlaceResolver.resolve("Algiers")!!
        val coords = place.latitude!! to place.longitude!!
        val quake = FixtureEvent(country = "Algeria", latitude = 36.5, longitude = 3.2)
        assertNotNull(match(quake, coords, place.country))
    }

    @Test
    fun `NOAA US event does not match Paris Dubai or Algiers`() {
        val noaa = FixtureEvent(
            country = "United States",
            latitude = null,
            longitude = null,
        )
        for (region in listOf("Paris, France", "Dubai, United Arab Emirates", "Algiers, Algeria")) {
            val place = PlaceResolver.resolve(region)!!
            val coords = if (place.hasCoords) place.latitude!! to place.longitude!! else null
            assertNull(
                match(noaa, coords, place.country),
                "NOAA US event incorrectly matched $region"
            )
            assertFalse(PlaceResolver.countryMatches("United States", place.country))
        }
    }

    @Test
    fun `NOAA-style US coords far from Paris do not match radius`() {
        val place = PlaceResolver.resolve("Paris, France")!!
        val coords = place.latitude!! to place.longitude!!
        // NYC coords
        val usStorm = FixtureEvent(country = "United States", latitude = 40.7, longitude = -74.0)
        assertNull(match(usStorm, coords, place.country))
    }

    @Test
    fun `coverage for France includes severe weather and MeteoAlarm`() {
        val c = CoveragePolicy.forPlace("France")
        assertEquals("france", c.packId)
        assertTrue(c.hazardsCovered.contains("severe_weather"))
        assertTrue(c.sourcesActive.contains("METEOALARM"))
        assertTrue(c.sourcesActive.contains("OPEN_METEO"))
        assertFalse(c.sourcesActive.contains("NOAA"))
        assertTrue(c.hazardsNotCovered.contains("crime"))
        assertTrue(c.coveredLabels.any { it.contains("MeteoAlarm", ignoreCase = true) })
        assertTrue(c.notCoveredLabels.any { it.contains("Crime", ignoreCase = true) })
    }

    @Test
    fun `coverage for UAE excludes NOAA and names NCM gap`() {
        val c = CoveragePolicy.forPlace("United Arab Emirates")
        assertEquals("uae", c.packId)
        assertTrue(c.sourcesActive.contains("OPEN_METEO"))
        assertFalse(c.sourcesActive.contains("NOAA"))
        assertFalse(c.sourcesActive.contains("METEOALARM"))
        assertTrue(c.notCoveredLabels.any { it.contains("NCM", ignoreCase = true) })
    }

    @Test
    fun `coverage for Algeria pack is explicit`() {
        val c = CoveragePolicy.forPlace("Algeria")
        assertEquals("algeria", c.packId)
        assertTrue(c.coveredLabels.any { it.contains("Open-Meteo", ignoreCase = true) })
        assertTrue(c.notCoveredLabels.any { it.contains("ONM", ignoreCase = true) || it.contains("crime", ignoreCase = true) })
    }

    @Test
    fun `checked-and-clear summary names sources and not omniscience`() {
        val c = CoveragePolicy.forPlace("Algeria")
        val s = CoveragePolicy.checkedAndClearSummary("Algiers", c)
        assertTrue(s.contains("USGS"))
        assertTrue(s.contains("Algiers"))
        assertTrue(s.contains("Quiet means") || s.contains("not that nothing"))
    }

    @Test
    fun `bare Paris country resolves to France pack`() {
        val place = PlaceResolver.resolve("Paris")!!
        val c = CoveragePolicy.forPlace(place.country)
        assertEquals("france", c.packId)
    }
}
