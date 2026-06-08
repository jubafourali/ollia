package com.ollia.saiae.risk

import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.Severity
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import kotlin.math.max
import kotlin.math.min

/**
 * Per-event-type weighting profile.
 *
 * @param severityMult  How strongly the source's physical severity drives risk
 *                       (earthquakes high — magnitude already captures danger).
 * @param densityMult   How strongly urban population density matters
 *                       (protests/violence high — a city event affects more people).
 * @param distMult       **Distance reach.** Higher = the event stays relevant over a
 *                       *wider* radius (storms, advisories). Lower = the event decays
 *                       fast with distance, i.e. it is hyper-local (protests, shootings,
 *                       explosions). The proximity factor uses `1 - dist / (R * distMult)`,
 *                       so a smaller distMult makes proximity a sharper discriminator.
 * @param minScore       Optional floor: high-stakes types (evacuation, war) should never
 *                       silently fall below this once they are geographically relevant.
 * @param noDecay        Persistent events (war, evacuation, pandemic) don't age out.
 * @param shallowDist    War-class events use a much wider base radius (800·distMult km).
 */
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
class RiskAssessmentService(
    // Injectable for deterministic age-penalty testing; defaults to system UTC in prod.
    private val clock: Clock = Clock.systemUTC()
) {

    // Every SafetyCategory has an explicit profile — no category may silently fall
    // through to a low-weight default (that previously under-scored EVACUATION_ORDER,
    // STATE_OF_EMERGENCY, STORM, etc.). `distMult` follows the semantics documented on
    // EventTypeConfig: small = hyper-local, large = wide-area reach.
    private val configs: Map<SafetyCategory, EventTypeConfig> = mapOf(
        // ── Conflict & security ──────────────────────────────────────────────
        SafetyCategory.MISSILE_ATTACK    to EventTypeConfig(2.0, 0.6, 2.0, 70,   noDecay = true,  shallowDist = true),
        SafetyCategory.ARMED_CONFLICT    to EventTypeConfig(1.8, 0.8, 1.7, 60,   noDecay = true,  shallowDist = true),
        SafetyCategory.WAR               to EventTypeConfig(1.8, 0.8, 1.7, 60,   noDecay = true,  shallowDist = true),
        SafetyCategory.TERRORISM         to EventTypeConfig(1.7, 1.2, 0.7, 55,   noDecay = false, shallowDist = false),
        SafetyCategory.EXPLOSION         to EventTypeConfig(1.5, 1.3, 0.6, 50,   noDecay = false, shallowDist = false),
        SafetyCategory.ACTIVE_SHOOTER    to EventTypeConfig(1.6, 1.4, 0.5, 55,   noDecay = false, shallowDist = false),
        SafetyCategory.VIOLENCE          to EventTypeConfig(1.4, 1.3, 0.6, null, noDecay = false, shallowDist = false),
        SafetyCategory.KIDNAPPING        to EventTypeConfig(1.4, 1.2, 0.5, 45,   noDecay = false, shallowDist = false),
        SafetyCategory.BORDER_TENSION    to EventTypeConfig(0.9, 0.8, 1.5, 40,   noDecay = false, shallowDist = false),
        SafetyCategory.PROTEST           to EventTypeConfig(0.8, 1.3, 0.5, null, noDecay = false, shallowDist = false),
        SafetyCategory.RIOT              to EventTypeConfig(1.2, 1.4, 0.6, 40,   noDecay = false, shallowDist = false),
        SafetyCategory.CIVIL_UNREST      to EventTypeConfig(1.0, 1.2, 0.8, null, noDecay = false, shallowDist = false),
        SafetyCategory.CURFEW            to EventTypeConfig(1.0, 0.9, 1.2, 40,   noDecay = false, shallowDist = false),
        // ── Natural disasters ────────────────────────────────────────────────
        SafetyCategory.EARTHQUAKE        to EventTypeConfig(1.2, 1.1, 1.0, null, noDecay = false, shallowDist = false),
        SafetyCategory.FLOOD             to EventTypeConfig(1.0, 1.2, 1.5, null, noDecay = false, shallowDist = false),
        SafetyCategory.WILDFIRE          to EventTypeConfig(1.1, 0.9, 1.3, null, noDecay = false, shallowDist = false),
        SafetyCategory.HURRICANE         to EventTypeConfig(1.1, 1.0, 2.0, 40,   noDecay = false, shallowDist = false),
        SafetyCategory.TORNADO           to EventTypeConfig(1.2, 1.0, 0.7, null, noDecay = false, shallowDist = false),
        SafetyCategory.STORM             to EventTypeConfig(0.9, 1.0, 1.6, null, noDecay = false, shallowDist = false),
        SafetyCategory.EXTREME_WEATHER   to EventTypeConfig(1.0, 1.0, 1.5, null, noDecay = false, shallowDist = false),
        SafetyCategory.TSUNAMI           to EventTypeConfig(1.6, 0.9, 1.2, 50,   noDecay = false, shallowDist = false),
        SafetyCategory.VOLCANO           to EventTypeConfig(1.3, 0.7, 0.9, 40,   noDecay = false, shallowDist = false),
        SafetyCategory.DROUGHT           to EventTypeConfig(0.5, 0.8, 2.0, null, noDecay = true,  shallowDist = false),
        SafetyCategory.LANDSLIDE         to EventTypeConfig(1.2, 0.9, 0.6, null, noDecay = false, shallowDist = false),
        SafetyCategory.AVALANCHE         to EventTypeConfig(1.2, 0.6, 0.6, null, noDecay = false, shallowDist = false),
        // ── Public health ────────────────────────────────────────────────────
        SafetyCategory.HEALTH_ALERT      to EventTypeConfig(1.0, 1.2, 1.0, 40,   noDecay = false, shallowDist = false),
        SafetyCategory.EPIDEMIC          to EventTypeConfig(1.0, 1.2, 1.5, 45,   noDecay = false, shallowDist = false),
        SafetyCategory.PANDEMIC          to EventTypeConfig(1.1, 1.2, 2.0, 50,   noDecay = true,  shallowDist = false),
        SafetyCategory.FOOD_CONTAMINATION to EventTypeConfig(0.7, 1.0, 1.0, null, noDecay = false, shallowDist = false),
        // ── Infrastructure & transport ───────────────────────────────────────
        SafetyCategory.TRANSPORT_DISRUPTION to EventTypeConfig(0.6, 1.1, 1.0, null, noDecay = false, shallowDist = false),
        SafetyCategory.AIRPORT_DISRUPTION   to EventTypeConfig(0.5, 0.8, 0.8, null, noDecay = false, shallowDist = false),
        SafetyCategory.MASS_CANCELLATION    to EventTypeConfig(0.5, 1.0, 1.0, null, noDecay = false, shallowDist = false),
        SafetyCategory.PORT_DISRUPTION      to EventTypeConfig(0.5, 0.8, 0.9, null, noDecay = false, shallowDist = false),
        SafetyCategory.BLACKOUT          to EventTypeConfig(0.7, 1.0, 1.2, null, noDecay = false, shallowDist = false),
        SafetyCategory.INTERNET_OUTAGE   to EventTypeConfig(0.5, 1.0, 1.4, null, noDecay = false, shallowDist = false),
        SafetyCategory.WATER_SHORTAGE    to EventTypeConfig(0.6, 1.0, 1.3, null, noDecay = false, shallowDist = false),
        // ── Government / geopolitical ────────────────────────────────────────
        SafetyCategory.GOVERNMENT_ADVISORY to EventTypeConfig(1.0, 1.0, 1.5, 40,  noDecay = false, shallowDist = false),
        SafetyCategory.STATE_OF_EMERGENCY  to EventTypeConfig(1.4, 1.1, 1.5, 60,  noDecay = true,  shallowDist = false),
        SafetyCategory.EVACUATION_ORDER    to EventTypeConfig(1.8, 1.0, 1.2, 70,  noDecay = true,  shallowDist = false),
        SafetyCategory.TRAVEL_RESTRICTION  to EventTypeConfig(0.8, 0.9, 1.5, 35,  noDecay = false, shallowDist = false),
        SafetyCategory.VISA_DISRUPTION     to EventTypeConfig(0.4, 0.8, 1.5, null, noDecay = false, shallowDist = false),
        // ── Crime & local safety ─────────────────────────────────────────────
        SafetyCategory.HIGH_CRIME_ALERT    to EventTypeConfig(0.9, 1.2, 0.8, null, noDecay = false, shallowDist = false),
        SafetyCategory.SCAM_ALERT          to EventTypeConfig(0.4, 1.0, 1.5, null, noDecay = false, shallowDist = false),
        SafetyCategory.TOURIST_TARGETING   to EventTypeConfig(0.7, 1.1, 0.8, null, noDecay = false, shallowDist = false),
        // ── Fallback ─────────────────────────────────────────────────────────
        SafetyCategory.OTHER               to EventTypeConfig(0.7, 1.0, 1.0, null, noDecay = false, shallowDist = false),
    )

    // Safety net only — every category above is explicit, so this should be unreachable.
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
        proximityKnown: Boolean = true,
        populationDensity: Double = estimateDensity(event.city ?: event.country)
    ): RiskAssessment {
        val cfg = configs[event.category] ?: defaultConfig
        val severityRaw = severityToRaw(event.severity)
        val now = Instant.now(clock)

        val proximityFactor = when {
            !proximityKnown -> 1.0
            cfg.shallowDist -> max(0.25, 1.0 - distanceKm / (800.0 * cfg.distMult))
            else            -> max(0.0,  1.0 - distanceKm / (200.0 * cfg.distMult))
        }

        val severityScore = (severityRaw / 10.0) * 100.0 * cfg.severityMult * proximityFactor
        val densityBoost  = (populationDensity / 10.0) * 20.0 * cfg.densityMult
        val ageMinutes    = Duration.between(event.eventOccurredAt ?: event.normalizedAt, now).toMinutes().toDouble()
        val agePenalty    = if (cfg.noDecay) 0.0 else min(ageMinutes / 720.0, 1.0) * 30.0
        val confMult      = confidence.score / 100.0

        val computedScore = ((severityScore + densityBoost - agePenalty) * confMult)
            .toInt().coerceIn(0, 95)

        // High-stakes types have a floor so a relevant event can't fall to silence.
        var finalScore = computedScore
        var floorApplied = false
        if (cfg.minScore != null) {
            val floored = (cfg.minScore * confMult).toInt()
            if (floored > finalScore) {
                finalScore = floored
                floorApplied = true
            }
        }

        val riskLevel = when {
            finalScore >= 65 -> RiskLevel.IMPORTANT_DISRUPTION   // push to circle
            finalScore >= 35 -> RiskLevel.STAY_AWARE             // quiet in-app, no push
            else             -> RiskLevel.NORMAL                 // silently ignored
        }

        return RiskAssessment(
            riskLevel    = riskLevel,
            finalScore   = finalScore,
            floorApplied = floorApplied
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