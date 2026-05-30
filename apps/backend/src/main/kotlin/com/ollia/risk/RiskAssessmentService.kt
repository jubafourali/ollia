package com.ollia.saiae.risk

import com.ollia.entity.RiskLevel
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.Severity
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import kotlin.math.max
import kotlin.math.min

data class EventTypeConfig(
    val severityMult: Double,
    val densityMult:  Double,
    val distMult:     Double,
    val minScore:     Int?,
    val noDecay:      Boolean,
    val shallowDist:  Boolean
)

data class RiskAssessment(
    val riskLevel:    RiskLevel,
    val finalScore:   Int,
    val floorApplied: Boolean
)

@Service
class RiskAssessmentService {

    private val configs: Map<SafetyCategory, EventTypeConfig> = mapOf(
        SafetyCategory.MISSILE_ATTACK    to EventTypeConfig(2.0, 0.6, 2.0, 70,   true,  true),
        SafetyCategory.ARMED_CONFLICT    to EventTypeConfig(1.8, 0.8, 1.7, 60,   true,  true),
        SafetyCategory.WAR               to EventTypeConfig(1.8, 0.8, 1.7, 60,   true,  true),
        SafetyCategory.TERRORISM         to EventTypeConfig(1.7, 1.2, 1.6, 55,   false, false),
        SafetyCategory.EXPLOSION         to EventTypeConfig(1.5, 1.3, 1.5, 50,   false, false),
        SafetyCategory.ACTIVE_SHOOTER    to EventTypeConfig(1.6, 1.4, 1.8, 55,   false, false),
        SafetyCategory.VIOLENCE          to EventTypeConfig(1.5, 1.3, 1.6, 50,   false, false),
        SafetyCategory.BORDER_TENSION    to EventTypeConfig(0.7, 0.8, 0.5, 40,   false, false),
        SafetyCategory.PROTEST           to EventTypeConfig(0.8, 1.3, 1.3, null, false, false),
        SafetyCategory.RIOT              to EventTypeConfig(1.2, 1.4, 1.5, null, false, false),
        SafetyCategory.CIVIL_UNREST      to EventTypeConfig(1.0, 1.2, 1.2, null, false, false),
        SafetyCategory.CURFEW            to EventTypeConfig(1.0, 0.9, 0.7, 40,   false, false),
        SafetyCategory.EARTHQUAKE        to EventTypeConfig(1.2, 1.1, 1.0, null, false, false),
        SafetyCategory.FLOOD             to EventTypeConfig(1.0, 1.2, 0.9, null, false, false),
        SafetyCategory.WILDFIRE          to EventTypeConfig(1.1, 0.9, 1.2, null, false, false),
        SafetyCategory.HURRICANE        to EventTypeConfig(1.1, 1.0, 0.8, null, false, false),
        SafetyCategory.TORNADO           to EventTypeConfig(1.1, 1.0, 0.8, null, false, false),
        SafetyCategory.EXTREME_WEATHER   to EventTypeConfig(1.0, 1.0, 0.8, null, false, false),
        SafetyCategory.TSUNAMI           to EventTypeConfig(1.5, 0.8, 0.7, null, false, false),
        SafetyCategory.VOLCANO           to EventTypeConfig(1.3, 0.7, 0.6, null, false, false),
        SafetyCategory.TRANSPORT_DISRUPTION to EventTypeConfig(0.7, 1.1, 1.4, null, false, false),
        SafetyCategory.BLACKOUT          to EventTypeConfig(0.6, 1.0, 0.5, null, false, false),
        SafetyCategory.INTERNET_OUTAGE   to EventTypeConfig(0.5, 1.0, 0.4, null, false, false),
        SafetyCategory.AIRPORT_DISRUPTION to EventTypeConfig(0.5, 0.8, 0.6, null, false, false),
        SafetyCategory.HEALTH_ALERT      to EventTypeConfig(1.0, 1.2, 0.5, 40,   false, false),
        SafetyCategory.EPIDEMIC          to EventTypeConfig(0.9, 1.2, 0.5, 40,   false, false),
        SafetyCategory.PANDEMIC          to EventTypeConfig(1.1, 1.2, 0.4, 50,   false, false),
    )

    private val defaultConfig = EventTypeConfig(0.8, 1.0, 0.8, null, false, false)

    // War events that trigger floor in the composer
    val warEventCategories = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR
    )

    /**
     * Assess risk for a given normalized event.
     *
     * @param event          The normalized safety event
     * @param confidence     Confidence report from Police Engine
     * @param distanceKm     Haversine distance from user to event (0 = same city)
     * @param populationDensity  1–10 scale, defaults to 5 (medium density) if unknown
     */
    fun assess(
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        distanceKm: Double,
        populationDensity: Double = 5.0
    ): RiskAssessment {
        val cfg = configs[event.category] ?: defaultConfig
        val severityRaw = severityToRaw(event.severity)
        val now = Instant.now()

        // Proximity factor
        val proximityFactor = if (cfg.shallowDist) {
            max(0.25, 1.0 - distanceKm / (800.0 * cfg.distMult))
        } else {
            max(0.0, 1.0 - distanceKm / (200.0 * cfg.distMult))
        }

        // Scoring
        val severityScore = (severityRaw / 10.0) * 100.0 * cfg.severityMult * proximityFactor
        val densityBoost  = (populationDensity / 10.0) * 20.0 * cfg.densityMult
        val ageMinutes    = Duration.between(event.eventOccurredAt ?: event.normalizedAt, now).toMinutes().toDouble()
        val agePenalty    = if (cfg.noDecay) 0.0 else min(ageMinutes / 720.0, 1.0) * 30.0
        val confMult      = confidence.score / 100.0

        var finalScore = ((severityScore + densityBoost - agePenalty) * confMult)
            .toInt().coerceIn(0, 95)

        // Floor score
        if (cfg.minScore != null) {
            val floor = (cfg.minScore * confMult).toInt()
            finalScore = max(finalScore, floor)
        }

        val riskLevel = when {
            finalScore >= 65 -> RiskLevel.IMPORTANT_DISRUPTION
            finalScore >= 35 -> RiskLevel.STAY_AWARE
            else             -> RiskLevel.NORMAL
        }

        return RiskAssessment(
            riskLevel    = riskLevel,
            finalScore   = finalScore,
            floorApplied = false  // Composer applies war event floor later
        )
    }

    private fun severityToRaw(severity: Severity) = when (severity) {
        Severity.CRITICAL -> 9
        Severity.HIGH     -> 7
        Severity.MEDIUM   -> 5
        Severity.LOW      -> 2
    }

    /** Haversine distance in km between two lat/lon points. */
    fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2).pow(2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2).pow(2)
        return r * 2 * Math.asin(Math.sqrt(a))
    }

    private fun Double.pow(n: Int): Double = Math.pow(this, n.toDouble())
}