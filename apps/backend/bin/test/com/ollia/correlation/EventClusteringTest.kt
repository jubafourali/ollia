package com.ollia.saiae.correlation

import com.ollia.entity.SafetyCategory
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventClusteringTest {

    private val t0 = Instant.parse("2026-06-07T12:00:00Z")

    private fun key(
        category: SafetyCategory = SafetyCategory.EARTHQUAKE,
        at: Instant = t0,
        country: String? = null,
        city: String? = null,
        lat: Double? = null,
        lng: Double? = null,
    ) = ClusterKey(category, at, country, city, lat, lng)

    // ── Coordinate-based clustering ──────────────────────────────────────────
    @Test fun `same quake reported with nearby epicenters clusters`() {
        val usgs  = key(lat = 35.68, lng = 139.69)            // Tokyo
        val gdacs = key(lat = 35.70, lng = 139.75)            // ~6 km away
        assertTrue(EventClustering.sameRealWorldEvent(usgs, gdacs))
    }

    @Test fun `far apart quakes do not cluster`() {
        val tokyo = key(lat = 35.68, lng = 139.69)
        val osaka = key(lat = 34.69, lng = 135.50)            // ~400 km
        assertFalse(EventClustering.sameRealWorldEvent(tokyo, osaka))
    }

    @Test fun `different categories never cluster`() {
        val quake = key(category = SafetyCategory.EARTHQUAKE, lat = 35.68, lng = 139.69)
        val flood = key(category = SafetyCategory.FLOOD, lat = 35.68, lng = 139.69)
        assertFalse(EventClustering.sameRealWorldEvent(quake, flood))
    }

    @Test fun `outside the time window does not cluster`() {
        val a = key(lat = 35.68, lng = 139.69, at = t0)
        val b = key(lat = 35.68, lng = 139.69, at = t0.plusSeconds(10 * 3600)) // 10h > 4h quake window
        assertFalse(EventClustering.sameRealWorldEvent(a, b))
    }

    // ── Country / city fallback (no coordinates) ─────────────────────────────
    @Test fun `same country news clusters when no coordinates`() {
        val reuters  = key(category = SafetyCategory.PROTEST, country = "France", city = "Paris")
        val newsdata = key(category = SafetyCategory.PROTEST, country = "france", city = "Paris")
        assertTrue(EventClustering.sameRealWorldEvent(reuters, newsdata))
    }

    @Test fun `same country different city does not cluster`() {
        val a = key(category = SafetyCategory.PROTEST, country = "France", city = "Paris")
        val b = key(category = SafetyCategory.PROTEST, country = "France", city = "Lyon")
        assertFalse(EventClustering.sameRealWorldEvent(a, b))
    }

    @Test fun `different countries do not cluster`() {
        val a = key(category = SafetyCategory.PROTEST, country = "France", city = "Paris")
        val b = key(category = SafetyCategory.PROTEST, country = "Spain", city = "Madrid")
        assertFalse(EventClustering.sameRealWorldEvent(a, b))
    }

    // ── Echo-chain origin resolution ─────────────────────────────────────────
    @Test fun `bbc republishing reuters resolves to reuters when reuters present`() {
        val origin = EventClustering.resolveOrigin(
            sourceId = "bbc",
            presentSources = setOf("reuters", "bbc"),
            republishesOf = listOf("reuters", "ap"),
        )
        assertEquals("reuters", origin)
    }

    @Test fun `bbc is independent when reuters absent`() {
        val origin = EventClustering.resolveOrigin(
            sourceId = "bbc",
            presentSources = setOf("bbc", "newsdata"),
            republishesOf = listOf("reuters", "ap"),
        )
        assertNull(origin)
    }

    @Test fun `source with no republish list is always independent`() {
        assertNull(EventClustering.resolveOrigin("reuters", setOf("reuters", "ap"), null))
    }
}