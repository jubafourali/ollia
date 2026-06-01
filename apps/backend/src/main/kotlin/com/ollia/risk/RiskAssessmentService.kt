package com.ollia.saiae.risk

import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
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
        SafetyCategory.HURRICANE         to EventTypeConfig(1.1, 1.0, 0.8, null, false, false),
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

    val warEventCategories = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR
    )

    fun assess(
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        distanceKm: Double,
        populationDensity: Double = estimateDensity(event.city ?: event.country)
    ): RiskAssessment {
        val cfg = configs[event.category] ?: defaultConfig
        val severityRaw = severityToRaw(event.severity)
        val now = Instant.now()

        val proximityFactor = if (cfg.shallowDist) {
            max(0.25, 1.0 - distanceKm / (800.0 * cfg.distMult))
        } else {
            max(0.0, 1.0 - distanceKm / (200.0 * cfg.distMult))
        }

        val severityScore = (severityRaw / 10.0) * 100.0 * cfg.severityMult * proximityFactor
        val densityBoost  = (populationDensity / 10.0) * 20.0 * cfg.densityMult
        val ageMinutes    = Duration.between(event.eventOccurredAt ?: event.normalizedAt, now).toMinutes().toDouble()
        val agePenalty    = if (cfg.noDecay) 0.0 else min(ageMinutes / 720.0, 1.0) * 30.0
        val confMult      = confidence.score / 100.0

        var finalScore = ((severityScore + densityBoost - agePenalty) * confMult)
            .toInt().coerceIn(0, 95)

        if (cfg.minScore != null) {
            finalScore = max(finalScore, (cfg.minScore * confMult).toInt())
        }

        val riskLevel = when {
            finalScore >= 65 -> RiskLevel.IMPORTANT_DISRUPTION
            finalScore >= 35 -> RiskLevel.STAY_AWARE
            else             -> RiskLevel.NORMAL
        }

        return RiskAssessment(
            riskLevel    = riskLevel,
            finalScore   = finalScore,
            floorApplied = false
        )
    }

    private fun severityToRaw(severity: Severity) = when (severity) {
        Severity.CRITICAL -> 9
        Severity.HIGH     -> 7
        Severity.MEDIUM   -> 5
        Severity.LOW      -> 2
    }

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

    companion object {

        /**
         * P1 fix — Population density estimation from city/country name.
         *
         * Returns a 1–10 density score used to boost risk for dense urban areas.
         * Megacities (Tokyo, Cairo, Lagos) = 9–10
         * Major cities (Paris, Nairobi, Dubai) = 6–8
         * Mid-size cities = 4–6
         * Rural/unknown = 3
         *
         * This is intentionally simple — no GIS required at this stage.
         * Replace with a real lookup table or geocoding service later.
         */
        fun estimateDensity(location: String?): Double {
            if (location == null) return 4.0  // unknown → medium-low

            val loc = location.lowercase()

            // Tier 1 — Megacities: extreme density (9–10)
            val megacities = listOf(
                "tokyo", "delhi", "shanghai", "dhaka", "cairo", "mumbai",
                "beijing", "karachi", "istanbul", "kinshasa", "lagos",
                "buenos aires", "kolkata", "manila", "guangzhou", "tianjin",
                "moscow", "lahore", "bangalore", "shenzhen", "jakarta"
            )
            if (megacities.any { loc.contains(it) }) return 9.5

            // Tier 2 — Major cities: high density (7–8)
            val majorCities = listOf(
                "nairobi", "algiers", "casablanca", "dubai", "riyadh",
                "beirut", "amman", "baghdad", "tehran", "tel aviv",
                "paris", "london", "berlin", "madrid", "rome", "new york",
                "los angeles", "chicago", "toronto", "sydney", "singapore",
                "bangkok", "seoul", "kuala lumpur", "lima", "bogota",
                "sao paulo", "santiago", "johannesburg", "cape town",
                "addis ababa", "kampala", "dar es salaam", "accra", "dakar",
                "tunis", "tripoli", "khartoum", "kyiv", "warsaw"
            )
            if (majorCities.any { loc.contains(it) }) return 7.5

            // Tier 3 — Country-level events (no specific city): medium density
            // Assume moderate urban context when only country is known
            val denseCountries = listOf(
                "bangladesh", "south korea", "netherlands", "india",
                "japan", "israel", "lebanon", "pakistan", "nigeria"
            )
            if (denseCountries.any { loc.contains(it) }) return 6.5

            val sparseCountries = listOf(
                "mongolia", "namibia", "botswana", "libya", "mauritania",
                "australia", "canada", "russia", "kazakhstan"
            )
            if (sparseCountries.any { loc.contains(it) }) return 2.5

            // Default — unknown or mid-size location
            return 4.0
        }
    }
}