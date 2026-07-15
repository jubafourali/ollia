package com.ollia.saiae.correlation

import com.ollia.entity.SafetyCategory
import com.ollia.util.GeoUtils
import java.time.Duration
import java.time.Instant
import kotlin.math.abs

/** The minimal event facts needed to decide whether two reports describe the same incident. */
data class ClusterKey(
    val category: SafetyCategory,
    val occurredAt: Instant,
    val country: String?,
    val city: String?,
    val lat: Double?,
    val lng: Double?,
)

/**
 * Pure clustering rules — "do these two normalized events describe the same real-world
 * incident?" Kept dependency-free so the matching + echo-chain logic is unit-testable.
 *
 * Two events cluster when they share a category, fall inside a category-sized time window,
 * and are geographically close (by coordinates when available, otherwise same country and —
 * if both name one — the same city).
 */
object EventClustering {

    fun windowHours(c: SafetyCategory): Long = when (c) {
        SafetyCategory.EARTHQUAKE, SafetyCategory.TSUNAMI,
        SafetyCategory.EXPLOSION, SafetyCategory.ACTIVE_SHOOTER -> 4
        SafetyCategory.WAR, SafetyCategory.ARMED_CONFLICT, SafetyCategory.MISSILE_ATTACK -> 72
        SafetyCategory.FLOOD, SafetyCategory.WILDFIRE, SafetyCategory.HURRICANE,
        SafetyCategory.STORM, SafetyCategory.EXTREME_WEATHER, SafetyCategory.VOLCANO -> 36
        SafetyCategory.PROTEST, SafetyCategory.RIOT, SafetyCategory.CIVIL_UNREST -> 12
        else -> 24
    }

    fun radiusKm(c: SafetyCategory): Double = when (c) {
        SafetyCategory.EARTHQUAKE, SafetyCategory.TSUNAMI -> 150.0
        SafetyCategory.WAR, SafetyCategory.ARMED_CONFLICT, SafetyCategory.MISSILE_ATTACK -> 300.0
        SafetyCategory.FLOOD, SafetyCategory.WILDFIRE, SafetyCategory.HURRICANE,
        SafetyCategory.STORM, SafetyCategory.EXTREME_WEATHER -> 250.0
        SafetyCategory.PROTEST, SafetyCategory.RIOT,
        SafetyCategory.ACTIVE_SHOOTER, SafetyCategory.EXPLOSION -> 40.0
        else -> 100.0
    }

    fun sameRealWorldEvent(a: ClusterKey, b: ClusterKey): Boolean {
        if (a.category != b.category) return false

        val window = maxOf(windowHours(a.category), windowHours(b.category))
        if (abs(Duration.between(a.occurredAt, b.occurredAt).toHours()) > window) return false

        // Coordinate match when both are geolocated.
        if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
            return GeoUtils.haversineKm(a.lat, a.lng, b.lat, b.lng) <= radiusKm(a.category)
        }

        // Otherwise fall back to country (+ city when both name one).
        val ca = a.country?.lowercase()?.trim()
        val cb = b.country?.lowercase()?.trim()
        if (ca.isNullOrEmpty() || cb.isNullOrEmpty() || ca != cb) return false

        val cia = a.city?.lowercase()?.trim()
        val cib = b.city?.lowercase()?.trim()
        if (!cia.isNullOrEmpty() && !cib.isNullOrEmpty() && cia != cib) return false

        return true
    }

    /**
     * Echo-chain resolution: if `sourceId` typically republishes another source that is also
     * present in the cluster, return that origin (so this source is NOT counted as independent
     * corroboration). e.g. BBC citing Reuters when Reuters is already in the cluster.
     */
    fun resolveOrigin(sourceId: String, presentSources: Set<String>, republishesOf: List<String>?): String? =
        republishesOf?.firstOrNull { it != sourceId && it in presentSources }
}