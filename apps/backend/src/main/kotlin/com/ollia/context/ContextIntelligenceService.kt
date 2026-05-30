package com.ollia.saiae.context

import com.ollia.entity.LocationRelevance
import com.ollia.entity.RiskLevel
import com.ollia.entity.UserActivityStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.User
import com.ollia.repository.ActivitySignalRepository
import com.ollia.saiae.risk.RiskAssessment
import com.ollia.saiae.risk.RiskAssessmentService
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant


data class ContextResult(
    val effectiveRisk:     RiskLevel,
    val floorApplied:      Boolean,
    val userStatus:        UserActivityStatus,
    val locationRelevance: LocationRelevance,
    val calmSentence:      String,
    val pushEligible:      Boolean,
    val distanceKm:        Double
)

@Service
class ContextIntelligenceService(
    private val activitySignalRepository: ActivitySignalRepository,
    private val riskAssessmentService: RiskAssessmentService
) {
    // War events that bypass activity suppression and always surface
    private val warEvents = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR
    )

    // Human-readable event nouns for sentence construction
    private val eventNoun: Map<SafetyCategory, String> = mapOf(
        SafetyCategory.MISSILE_ATTACK    to "a missile attack",
        SafetyCategory.ARMED_CONFLICT    to "armed conflict",
        SafetyCategory.WAR               to "armed conflict",
        SafetyCategory.TERRORISM         to "a security incident",
        SafetyCategory.EXPLOSION         to "an explosion",
        SafetyCategory.ACTIVE_SHOOTER    to "an active shooting",
        SafetyCategory.VIOLENCE          to "a security incident",
        SafetyCategory.PROTEST           to "protest activity",
        SafetyCategory.RIOT              to "a riot",
        SafetyCategory.CIVIL_UNREST      to "civil unrest",
        SafetyCategory.CURFEW            to "a curfew",
        SafetyCategory.EARTHQUAKE        to "an earthquake",
        SafetyCategory.FLOOD             to "a flood",
        SafetyCategory.WILDFIRE          to "a wildfire",
        SafetyCategory.HURRICANE        to "a hurricane",
        SafetyCategory.TORNADO           to "a tornado",
        SafetyCategory.EXTREME_WEATHER   to "severe weather",
        SafetyCategory.TSUNAMI           to "a tsunami",
        SafetyCategory.VOLCANO           to "volcanic activity",
        SafetyCategory.TRANSPORT_DISRUPTION to "a transport disruption",
        SafetyCategory.BLACKOUT          to "a power outage",
        SafetyCategory.INTERNET_OUTAGE   to "an internet disruption",
        SafetyCategory.AIRPORT_DISRUPTION to "an airport disruption",
        SafetyCategory.HEALTH_ALERT      to "a health emergency",
        SafetyCategory.EPIDEMIC          to "an epidemic alert",
        SafetyCategory.PANDEMIC          to "a pandemic alert",
        SafetyCategory.BORDER_TENSION    to "a border closure",
    )

    fun compute(
        memberName: String,
        event: NormalizedSafetyEvent,
        risk: RiskAssessment,
        confidence: SaiaeConfidenceReport,
        user: User
    ): ContextResult {
        val now = Instant.now()
        val userStatus = classifyUserStatus(user, now)
        val (locationRelevance, distanceKm) = classifyLocation(user, event)

        // War event floor — applies for same country or border region only
        val isWarEvent = event.category in warEvents
        val floorApplied = isWarEvent &&
                risk.riskLevel != RiskLevel.IMPORTANT_DISRUPTION &&
                locationRelevance in setOf(
            LocationRelevance.SAME_CITY,
            LocationRelevance.SAME_COUNTRY,
            LocationRelevance.BORDER_REGION
        )
        val effectiveRisk = if (floorApplied) RiskLevel.IMPORTANT_DISRUPTION else risk.riskLevel

        // Push eligibility
        val pushEligible = when {
            effectiveRisk == RiskLevel.IMPORTANT_DISRUPTION                                     -> true
            isWarEvent && effectiveRisk != RiskLevel.NORMAL                                      -> true
            effectiveRisk == RiskLevel.STAY_AWARE && userStatus == UserActivityStatus.SILENT &&
                    locationRelevance in setOf(LocationRelevance.SAME_CITY, LocationRelevance.SAME_COUNTRY) -> true
            else -> false
        }

        val sentence = buildSentence(memberName, event, confidence, userStatus, locationRelevance, now)

        return ContextResult(
            effectiveRisk     = effectiveRisk,
            floorApplied      = floorApplied,
            userStatus        = userStatus,
            locationRelevance = locationRelevance,
            calmSentence      = sentence,
            pushEligible      = pushEligible,
            distanceKm        = distanceKm
        )
    }

    // ─── User Status ───────────────────────────────────────────────────────────

    private fun classifyUserStatus(user: User, now: Instant): UserActivityStatus {
        val lastSignal = listOfNotNull(user.lastCheckInAt, user.lastPassiveSignalAt).maxOrNull()
            ?: return UserActivityStatus.SILENT
        val hoursAgo = Duration.between(lastSignal, now).toHours()
        return when {
            hoursAgo <= 4  -> UserActivityStatus.ACTIVE
            hoursAgo <= 12 -> UserActivityStatus.QUIET
            else           -> UserActivityStatus.SILENT
        }
    }

    // ─── Location Relevance ────────────────────────────────────────────────────

    private fun classifyLocation(user: User, event: NormalizedSafetyEvent): Pair<LocationRelevance, Double> {
        val userRegion = user.region ?: return Pair(LocationRelevance.UNKNOWN, 0.0)

        // Same city check
        val eventCity = event.city
        if (eventCity != null && userRegion.contains(eventCity, ignoreCase = true)) {
            return Pair(LocationRelevance.SAME_CITY, 0.0)
        }

        // Same country check
        val eventCountry = event.country
        if (eventCountry != null && userRegion.contains(eventCountry, ignoreCase = true)) {
            return Pair(LocationRelevance.SAME_COUNTRY, 0.0)
        }

        // Border region check (needs coordinates)
        if (event.latitude != null && event.longitude != null) {
            val userCoords = approximateUserCoords(userRegion)
            if (userCoords != null) {
                val dist = riskAssessmentService.haversineKm(
                    userCoords.first, userCoords.second,
                    event.latitude, event.longitude
                )
                if (dist <= 200.0) {
                    return Pair(LocationRelevance.BORDER_REGION, dist)
                }
                return Pair(LocationRelevance.DISTANT, dist)
            }
        }

        return Pair(LocationRelevance.DISTANT, 999.0)
    }

    /**
     * Approximate lat/lon from a region string using a small lookup of
     * major cities. For unknown regions returns null (treated as DISTANT).
     * In production this can be replaced with a geocoding service or a
     * comprehensive city DB.
     */
    private fun approximateUserCoords(region: String): Pair<Double, Double>? {
        val r = region.lowercase()
        return CITY_COORDS.entries.firstOrNull { r.contains(it.key) }?.value
    }

    // ─── Sentence Construction ─────────────────────────────────────────────────

    private fun buildSentence(
        name: String,
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        userStatus: UserActivityStatus,
        location: LocationRelevance,
        now: Instant
    ): String {
        val noun     = eventNoun[event.category] ?: "a safety event"
        val prefix   = confidencePrefix(confidence)
        val actPhrase = activityPhrase(userStatus, now)
        val isWar    = event.category in warEvents
        val isInternet = event.category == SafetyCategory.INTERNET_OUTAGE

        // War events: always lead with the event if user is silent
        if (isWar) {
            return when (userStatus) {
                UserActivityStatus.SILENT ->
                    "${prefix.capitalize()}${noun} has been reported near $name's location. $actPhrase You may want to reach out directly."
                UserActivityStatus.ACTIVE ->
                    "$name was last active recently. $actPhrase ${prefix.capitalize()}${noun} has been reported in the area."
                else ->
                    "$name was last active a few hours ago. ${prefix.capitalize()}${noun} has been reported nearby."
            }
        }

        // Standard: lead with person, then activity, then event
        val checkinClause = checkinClause(name, userStatus, now, event.latestCheckIn)
        val locationClause = locationClause(location, event.country)
        val internetSuffix = if (isInternet) " Activity signals may be limited." else ""

        return "$checkinClause $actPhrase ${prefix.capitalize()}${noun} has been reported${locationClause}.${internetSuffix}".trim()
    }

    private fun confidencePrefix(confidence: SaiaeConfidenceReport): String = when (confidence.tier) {
        "HIGH"       -> ""
        "MODERATE"   -> "Reports of "
        "LOW"        -> "Unconfirmed reports of "
        else         -> "Conflicting reports of "  // CONFLICTING state
    }

    private fun activityPhrase(status: UserActivityStatus, now: Instant): String = when (status) {
        UserActivityStatus.ACTIVE -> "Normal activity detected."
        UserActivityStatus.QUIET  -> "Activity lower than usual."
        UserActivityStatus.SILENT -> "No recent activity detected."
    }

    private fun checkinClause(name: String, status: UserActivityStatus, now: Instant, lastSeen: Instant?): String {
        if (lastSeen == null) return "$name's last check-in is unknown."
        val hoursAgo = Duration.between(lastSeen, now).toHours()
        val timeLabel = when {
            hoursAgo < 1  -> "less than an hour ago"
            hoursAgo == 1L -> "1 hour ago"
            hoursAgo < 24  -> "$hoursAgo hours ago"
            else           -> "${hoursAgo / 24} day(s) ago"
        }
        return "$name checked in $timeLabel."
    }

    private fun locationClause(location: LocationRelevance, country: String?): String = when (location) {
        LocationRelevance.SAME_CITY     -> " nearby"
        LocationRelevance.SAME_COUNTRY  -> " in their country"
        LocationRelevance.BORDER_REGION -> " near the region"
        LocationRelevance.DISTANT       -> if (country != null) " in $country" else " in another region"
        LocationRelevance.UNKNOWN       -> " nearby"
    }

    private val NormalizedSafetyEvent.latestCheckIn: Instant?
        get() = eventOccurredAt ?: normalizedAt

    private fun String.capitalize() = replaceFirstChar { it.uppercase() }

    companion object {
        // Major city approximate coordinates for proximity checks
        private val CITY_COORDS: Map<String, Pair<Double, Double>> = mapOf(
            "dubai"        to Pair(25.2, 55.3),
            "abu dhabi"    to Pair(24.5, 54.4),
            "riyadh"       to Pair(24.7, 46.7),
            "beirut"       to Pair(33.9, 35.5),
            "amman"        to Pair(31.9, 35.9),
            "cairo"        to Pair(30.1, 31.2),
            "algiers"      to Pair(36.7, 3.1),
            "paris"        to Pair(48.9, 2.3),
            "london"       to Pair(51.5, -0.1),
            "berlin"       to Pair(52.5, 13.4),
            "madrid"       to Pair(40.4, -3.7),
            "rome"         to Pair(41.9, 12.5),
            "new york"     to Pair(40.7, -74.0),
            "los angeles"  to Pair(34.1, -118.2),
            "toronto"      to Pair(43.7, -79.4),
            "sydney"       to Pair(-33.9, 151.2),
            "tokyo"        to Pair(35.7, 139.7),
            "beijing"      to Pair(39.9, 116.4),
            "mumbai"       to Pair(19.1, 72.9),
            "nairobi"      to Pair(-1.3, 36.8),
            "lagos"        to Pair(6.5, 3.4),
            "casablanca"   to Pair(33.6, -7.6),
            "istanbul"     to Pair(41.0, 29.0),
            "kyiv"         to Pair(50.5, 30.5),
            "moscow"       to Pair(55.8, 37.6),
            "tehran"       to Pair(35.7, 51.4),
            "karachi"      to Pair(24.9, 67.0),
            "dhaka"        to Pair(23.8, 90.4),
            "jakarta"      to Pair(-6.2, 106.8),
            "manila"       to Pair(14.6, 121.0),
            "bogota"       to Pair(4.7, -74.1),
            "lima"         to Pair(-12.1, -77.0),
            "buenos aires" to Pair(-34.6, -58.4),
            "sao paulo"    to Pair(-23.5, -46.6)
        )
    }
}