package com.ollia.saiae.context

import com.ollia.entity.LocationRelevance
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.User
import com.ollia.entity.UserActivityStatus
import com.ollia.saiae.risk.RiskAssessment
import org.springframework.stereotype.Service
import java.time.Clock
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

/**
 * Context Intelligence — answers "should I worry about *my* person right now?".
 *
 * It combines the verified event (+ confidence + risk + location relevance, all resolved
 * upstream) with what we know about the watched person — their last check-in / passive
 * activity — to produce ONE calm, reassurance-first sentence.
 *
 * Product philosophy is load-bearing here: copy must reduce anxiety, never amplify it.
 * Dependency-free and clock-injectable so the wording is fully unit-tested.
 */
@Service
class ContextIntelligenceService(
    private val clock: Clock = Clock.systemUTC()
) {
    private val warEvents = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR
    )

    private val eventNoun: Map<SafetyCategory, String> = mapOf(
        SafetyCategory.MISSILE_ATTACK       to "a missile attack",
        SafetyCategory.ARMED_CONFLICT       to "armed conflict",
        SafetyCategory.WAR                  to "armed conflict",
        SafetyCategory.TERRORISM            to "a security incident",
        SafetyCategory.EXPLOSION            to "an explosion",
        SafetyCategory.ACTIVE_SHOOTER       to "a security incident",
        SafetyCategory.VIOLENCE             to "a security incident",
        SafetyCategory.KIDNAPPING           to "a security incident",
        SafetyCategory.PROTEST              to "protest activity",
        SafetyCategory.RIOT                 to "unrest",
        SafetyCategory.CIVIL_UNREST         to "civil unrest",
        SafetyCategory.CURFEW               to "a curfew",
        SafetyCategory.BORDER_TENSION       to "a border closure",
        SafetyCategory.EARTHQUAKE           to "an earthquake",
        SafetyCategory.FLOOD                to "flooding",
        SafetyCategory.WILDFIRE             to "a wildfire",
        SafetyCategory.HURRICANE            to "a hurricane",
        SafetyCategory.TORNADO              to "a tornado",
        SafetyCategory.STORM                to "a storm",
        SafetyCategory.EXTREME_WEATHER      to "severe weather",
        SafetyCategory.TSUNAMI              to "a tsunami warning",
        SafetyCategory.VOLCANO              to "volcanic activity",
        SafetyCategory.DROUGHT              to "drought conditions",
        SafetyCategory.LANDSLIDE            to "a landslide",
        SafetyCategory.AVALANCHE            to "an avalanche",
        SafetyCategory.TRANSPORT_DISRUPTION to "a transport disruption",
        SafetyCategory.AIRPORT_DISRUPTION   to "an airport disruption",
        SafetyCategory.MASS_CANCELLATION    to "widespread cancellations",
        SafetyCategory.PORT_DISRUPTION      to "a port disruption",
        SafetyCategory.BLACKOUT             to "a power outage",
        SafetyCategory.INTERNET_OUTAGE      to "an internet disruption",
        SafetyCategory.WATER_SHORTAGE       to "a water shortage",
        SafetyCategory.HEALTH_ALERT         to "a health advisory",
        SafetyCategory.EPIDEMIC             to "a health advisory",
        SafetyCategory.PANDEMIC             to "a health advisory",
        SafetyCategory.FOOD_CONTAMINATION   to "a food safety advisory",
        SafetyCategory.GOVERNMENT_ADVISORY  to "an official advisory",
        SafetyCategory.STATE_OF_EMERGENCY   to "a state of emergency",
        SafetyCategory.EVACUATION_ORDER     to "an evacuation notice",
        SafetyCategory.TRAVEL_RESTRICTION   to "a travel restriction",
        SafetyCategory.VISA_DISRUPTION      to "a visa disruption",
        SafetyCategory.HIGH_CRIME_ALERT     to "a local safety advisory",
        SafetyCategory.SCAM_ALERT           to "a scam advisory",
        SafetyCategory.TOURIST_TARGETING    to "a local safety advisory",
    )

    fun compute(
        memberName: String,
        event: NormalizedSafetyEvent,
        risk: RiskAssessment,
        confidence: SaiaeConfidenceReport,
        user: User,
        locationRelevance: LocationRelevance,
        distanceKm: Double,
    ): ContextResult {
        val now = Instant.now(clock)
        val lastSeen = listOfNotNull(user.lastCheckInAt, user.lastPassiveSignalAt).maxOrNull()
        val userStatus = classifyUserStatus(lastSeen, now)

        // War floor — a nearby armed-conflict event is always important enough to surface,
        // which (via strict push gating below) is also what makes it pushable.
        val isWar = event.category in warEvents
        val floorApplied = isWar &&
            risk.riskLevel != RiskLevel.IMPORTANT_DISRUPTION &&
            locationRelevance in setOf(
                LocationRelevance.SAME_CITY,
                LocationRelevance.SAME_COUNTRY,
                LocationRelevance.BORDER_REGION,
            )
        val effectiveRisk = if (floorApplied) RiskLevel.IMPORTANT_DISRUPTION else risk.riskLevel

        // Strict gate: push ONLY for IMPORTANT_DISRUPTION. "When in doubt, don't push."
        val pushEligible = effectiveRisk == RiskLevel.IMPORTANT_DISRUPTION

        val sentence = buildSentence(memberName, event, confidence, userStatus, locationRelevance, lastSeen, now)

        return ContextResult(
            effectiveRisk     = effectiveRisk,
            floorApplied      = floorApplied,
            userStatus        = userStatus,
            locationRelevance = locationRelevance,
            calmSentence      = sentence,
            pushEligible      = pushEligible,
            distanceKm        = distanceKm,
        )
    }

    private fun classifyUserStatus(lastSeen: Instant?, now: Instant): UserActivityStatus {
        if (lastSeen == null) return UserActivityStatus.SILENT
        val hoursAgo = Duration.between(lastSeen, now).toHours()
        return when {
            hoursAgo <= 3 -> UserActivityStatus.ACTIVE
            hoursAgo <= 8 -> UserActivityStatus.QUIET
            else          -> UserActivityStatus.SILENT
        }
    }

    // ─── Sentence construction — calm, reassurance-first ────────────────────────

    private fun buildSentence(
        name: String,
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        status: UserActivityStatus,
        location: LocationRelevance,
        lastSeen: Instant?,
        now: Instant,
    ): String {
        val noun      = eventNoun[event.category] ?: "a safety event"
        val where     = locationPhrase(location, event.country)
        val eventText = eventClause(confidence.tier, noun, where)
        val person    = personClause(name, status, lastSeen, now)
        val isWar     = event.category in warEvents
        val internet  = if (event.category == SafetyCategory.INTERNET_OUTAGE)
            " Their activity signals may be limited right now." else ""

        val core = when (status) {
            // Recently seen → lead with reassurance, close with reassurance.
            UserActivityStatus.ACTIVE ->
                "$person $eventText Nothing right now suggests $name is affected."

            // Seen a while ago → state calmly, person first (or event first for war).
            UserActivityStatus.QUIET ->
                if (isWar) "$eventText $person"
                else       "$person $eventText"

            // Not seen recently → event first, then a gentle, supportive nudge.
            UserActivityStatus.SILENT ->
                if (isWar) "$eventText $person A message could help you both feel at ease."
                else       "$eventText $person Reaching out could help you check in."
        }
        return (core + internet).trim()
    }

    /** Confidence framing — never doubles the verb ("reports of … has been reported"). */
    private fun eventClause(tier: String, noun: String, where: String): String = when (tier) {
        "HIGH"     -> "${noun.cap()} has been reported$where."
        "MODERATE" -> "Reports indicate $noun$where."
        "LOW"      -> "There are early, unconfirmed reports of $noun$where."
        else       -> "Sources are still confirming reports of $noun$where."
    }

    private fun personClause(name: String, status: UserActivityStatus, lastSeen: Instant?, now: Instant): String {
        if (lastSeen == null) return "We don't have a recent check-in from $name yet."
        val t = timeLabel(lastSeen, now)
        return when (status) {
            UserActivityStatus.ACTIVE -> "$name checked in $t and appears unaffected."
            UserActivityStatus.QUIET  -> "$name was last active $t."
            UserActivityStatus.SILENT -> "$name was last active $t."
        }
    }

    private fun locationPhrase(location: LocationRelevance, country: String?): String = when (location) {
        LocationRelevance.SAME_CITY     -> " nearby"
        LocationRelevance.SAME_COUNTRY  -> if (!country.isNullOrBlank()) " in $country" else " in their country"
        LocationRelevance.BORDER_REGION -> " in the wider region"
        LocationRelevance.DISTANT       -> if (!country.isNullOrBlank()) " in $country" else " in another region"
        LocationRelevance.UNKNOWN       -> " nearby"
    }

    private fun timeLabel(lastSeen: Instant, now: Instant): String {
        val mins = Duration.between(lastSeen, now).toMinutes().coerceAtLeast(0)
        return when {
            mins < 2     -> "just now"
            mins < 60    -> "$mins minutes ago"
            mins < 120   -> "an hour ago"
            mins < 1440  -> "${mins / 60} hours ago"
            mins < 2880  -> "yesterday"
            else         -> "${mins / 1440} days ago"
        }
    }

    private fun String.cap() = replaceFirstChar { it.uppercase() }
}