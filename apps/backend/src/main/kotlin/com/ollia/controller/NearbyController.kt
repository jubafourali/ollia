package com.ollia.controller

import com.ollia.dto.NearbyEventResponse
import com.ollia.dto.NearbyMemberResponse
import com.ollia.dto.NearbyRegionResponse
import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.LocationRelevance
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.UserRepository
import com.ollia.saiae.context.ContextIntelligenceService
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import com.ollia.saiae.risk.RiskAssessmentService
import com.ollia.service.CurrentUserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import kotlin.math.*

/**
 * GET /api/v2/nearby
 *
 * Returns verified safety events grouped by circle member.
 * Queries normalized_safety_events directly — no cache dependency.
 *
 * For each circle member:
 *   1. Find all VERIFIED events
 *   2. Filter to those geographically relevant to the member's region
 *   3. Score risk and build human sentence on the fly
 *   4. Return sorted by risk descending
 *
 * Members with no nearby events are included with an empty events list
 * so the UI can render the "quiet" state for them.
 */
@RestController
@RequestMapping("/api/v2/nearby")
class NearbyController(
    private val currentUserService: CurrentUserService,
    private val userRepository: UserRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyCircleRepository: FamilyCircleRepository,
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val sourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val riskEngine: RiskAssessmentService,
    private val contextEngine: ContextIntelligenceService
) {

    @GetMapping
    fun getNearby(): ResponseEntity<List<NearbyMemberResponse>> {
        val me = currentUserService.getCurrentUser()

        // Find all circles the current user belongs to
        val circleIds = familyMemberRepository
            .findAllByUserId(me.id!!)
            .map { it.circleId }
            .distinct()

        if (circleIds.isEmpty()) return ResponseEntity.ok(emptyList())

        val otherMemberIds = familyMemberRepository
            .findAllByCircleIdIn(circleIds)
            .map { it.userId }
            .filter { it != me.id }
            .distinct()

        // Include the current user themselves
        val allMemberIds = (otherMemberIds + me.id!!).distinct()
        val memberUsers = userRepository.findAllById(allMemberIds)
            .associateBy { it.id!! }

        // Load ALL verified events once
        val verifiedEvents = normalizedRepo.findAllByStatus(EventStatus.VERIFIED)
        if (verifiedEvents.isEmpty()) {
            // Return all members with empty events (quiet state)
            return ResponseEntity.ok(
                otherMemberIds.mapNotNull { id ->
                    memberUsers[id]?.let { user ->
                        NearbyMemberResponse(
                            memberId = id,
                            name = user.name,
                            region = displayRegion(user),
                            events = emptyList()
                        )
                    }
                }
            )
        }

        // Pre-load confidence, source matches, and the registry once — scoped to the
        // verified event set. No full-table scans, no per-event source-match queries.
        val verifiedEventIds = verifiedEvents.mapNotNull { it.id }
        val confidenceByEventId = confidenceReportRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .associateBy { it.normalizedEventId }
        val sourceRegistry = sourceRegistryRepo.findAll().associateBy { it.id }
        val matchesByEventId = sourceMatchRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .groupBy { it.normalizedEventId }

        // Build response — one entry per circle member
        val result = allMemberIds.mapNotNull { memberId ->
            val user = memberUsers[memberId] ?: return@mapNotNull null

            val presenceRegion = presenceRegion(user)
            val userCoords = approximateCoords(presenceRegion)
            val userCountry = extractCountry(presenceRegion)

            val events = verifiedEvents.mapNotNull { event ->
                val confidence = confidenceByEventId[event.id] ?: return@mapNotNull null

                // ── Geographic relevance check ────────────────────────────────
                val match = computeDistance(event, userCoords, userCountry) ?: return@mapNotNull null

                // ── Risk assessment ───────────────────────────────────────────
                val risk  = riskEngine.assess(event, confidence, match.distanceKm, proximityKnown = match.proximityKnown)
                if (risk.riskLevel == RiskLevel.NORMAL) return@mapNotNull null

                // ── Build sentence ────────────────────────────────────────────
                val relevance = when {
                    match.distanceKm <= 50  -> LocationRelevance.SAME_CITY
                    match.distanceKm <= 300 -> LocationRelevance.SAME_COUNTRY
                    match.distanceKm <= 500 -> LocationRelevance.BORDER_REGION
                    else                    -> LocationRelevance.DISTANT
                }
                val context = try {
                    contextEngine.compute(
                        memberName        = user.name,
                        event             = event,
                        risk              = risk,
                        confidence        = confidence,
                        user              = user,
                        locationRelevance = relevance,
                        distanceKm        = match.distanceKm,
                    )
                } catch (e: Exception) {
                    return@mapNotNull null
                }

                // ── Source label ──────────────────────────────────────────────
                val sourceIds = matchesByEventId[event.id!!].orEmpty().map { it.sourceId }
                val sourcesLabel = buildSourcesLabel(sourceIds, sourceRegistry)

                NearbyEventResponse(
                    eventId = event.id,
                    eventLabel = eventLabel(event.category),
                    sentence = context.calmSentence,
                    riskLevel = risk.riskLevel.name,
                    sourcesLabel = sourcesLabel,
                    category = event.category.name
                )
            }
                .sortedByDescending { riskOrdinal(it.riskLevel) }
                .take(10) // cap per member to avoid overwhelming the UI

            NearbyMemberResponse(
                memberId = memberId,
                name     = user.name,
                region   = displayRegion(user),
                events   = events,
                isMe     = memberId == me.id
            )
        }
            // Members with events first, then quiet members
            .sortedWith(compareByDescending<NearbyMemberResponse> { it.isMe }.thenByDescending { it.events.size })

        return ResponseEntity.ok(result)
    }

    /**
     * GET /api/v2/nearby/region?region=Ubud,+Indonesia
     *
     * Region-scoped feed for the "Nearby" screen — answers "what's happening around
     * *this place* right now?" for an arbitrary region the user is browsing (typed,
     * searched, or their own location), independent of who is in their circle.
     *
     * Runs the same verified-event → geographic-relevance → risk → source pipeline as
     * [getNearby], but resolves location from the query string and builds a
     * region-centric (not person-centric) calm sentence. Returns a server-computed
     * worst-risk and smart-summary so the banner and feed render from one source.
     */
    @GetMapping("/region")
    fun getRegion(@RequestParam region: String): ResponseEntity<NearbyRegionResponse> {
        currentUserService.getCurrentUser() // require an authenticated caller
        val trimmed = region.trim()
        if (trimmed.isBlank()) {
            return ResponseEntity.ok(NearbyRegionResponse(trimmed, "NORMAL", calmAllClear(trimmed), emptyList()))
        }

        val verifiedEvents = normalizedRepo.findAllByStatus(EventStatus.VERIFIED)
        if (verifiedEvents.isEmpty()) {
            return ResponseEntity.ok(NearbyRegionResponse(trimmed, "NORMAL", calmAllClear(trimmed), emptyList()))
        }

        // Pre-load confidence, source matches, and the registry once — scoped to the
        // verified event set (same approach as getNearby; no full-table scans).
        val verifiedEventIds = verifiedEvents.mapNotNull { it.id }
        val confidenceByEventId = confidenceReportRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .associateBy { it.normalizedEventId }
        val sourceRegistry = sourceRegistryRepo.findAll().associateBy { it.id }
        val matchesByEventId = sourceMatchRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .groupBy { it.normalizedEventId }

        // ── Country-only matching (temporary) ─────────────────────────────────
        // Coordinate/city-radius matching is disabled for now — we surface every
        // verified event in the user's country. The distance logic is preserved in
        // computeDistance()/approximateCoords()/CITY_COORDS for when we re-enable it.
        // val regionCoords  = approximateCoords(trimmed)
        val regionCountry = extractCountry(trimmed)

        val events = verifiedEvents.mapNotNull { event ->
            val confidence = confidenceByEventId[event.id] ?: return@mapNotNull null

            // ── Country relevance check ───────────────────────────────────────
            // Relevant if the event is in the same country (war events stay global).
            val isWar = event.category in WAR_CATEGORIES
            val eventCountry = event.country?.lowercase()?.trim()
            val sameCountry = !eventCountry.isNullOrBlank() && regionCountry.isNotBlank() &&
                    (eventCountry.contains(regionCountry) || regionCountry.contains(eventCountry))
            if (!sameCountry && !isWar) return@mapNotNull null // not in this country — skip

            val relevance = if (sameCountry) LocationRelevance.SAME_COUNTRY
                            else LocationRelevance.DISTANT

            // ── Risk assessment + war floor ───────────────────────────────────
            // Assess at distance 0 (at-source / full strength) so a country-relevant
            // event isn't decayed below the visibility floor by proximity.
            val risk = riskEngine.assess(event, confidence, 0.0)
            val warFloored = isWar && sameCountry
            val effectiveRisk = if (warFloored) RiskLevel.IMPORTANT_DISRUPTION else risk.riskLevel
            if (effectiveRisk == RiskLevel.NORMAL) return@mapNotNull null

            // ── Region-centric calm sentence ──────────────────────────────────
            val sentence = try {
                contextEngine.regionalSentence(event, confidence, relevance)
            } catch (e: Exception) {
                return@mapNotNull null
            }

            val sourceIds = matchesByEventId[event.id!!].orEmpty().map { it.sourceId }
            NearbyEventResponse(
                eventId      = event.id!!,
                eventLabel   = eventLabel(event.category),
                sentence     = sentence,
                riskLevel    = effectiveRisk.name,
                sourcesLabel = buildSourcesLabel(sourceIds, sourceRegistry),
                category     = event.category.name,
            )
        }
            .sortedByDescending { riskOrdinal(it.riskLevel) }
            .take(20)

        val worstRisk = events.maxByOrNull { riskOrdinal(it.riskLevel) }?.riskLevel ?: "NORMAL"
        val summary   = events.firstOrNull()?.sentence ?: calmAllClear(trimmed)

        return ResponseEntity.ok(NearbyRegionResponse(trimmed, worstRisk, summary, events))
    }

    private fun calmAllClear(region: String): String {
        val place = region.substringBefore(",").trim().ifBlank { "this area" }
        return "Things look calm around $place. Nothing needs your attention right now."
    }

    // ── Geographic matching ───────────────────────────────────────────────────

    /**
     * Returns distance in km if the event is relevant to the user, null if not.
     * Relevant = same country OR within 500km when coordinates available.
     *
     * Currently unused — getRegion() uses country-only matching for now. Kept so the
     * coordinate/radius matching can be re-enabled without rewriting it.
     */
//    @Suppress("unused")
//    private fun computeDistance(
//        event: NormalizedSafetyEvent,
//        userCoords: Pair<Double, Double>?,
//        userCountry: String
//    ): Double? {
//        val isWar = event.category in WAR_CATEGORIES
//
//        return when {
//            // Have coordinates for both
//            event.latitude != null && event.longitude != null && userCoords != null -> {
//                val dist = haversineKm(
//                    userCoords.first, userCoords.second,
//                    event.latitude, event.longitude
//                )
//                if (dist <= 500.0 || isWar) dist else null
//            }
//
//            // Country-only matching
//            event.country != null && userCountry.isNotBlank() -> {
//                val eventCountry = event.country.lowercase().trim()
//                val sameCountry = eventCountry.contains(userCountry) ||
//                        userCountry.contains(eventCountry)
//                if (sameCountry || isWar) 150.0 else null
//            }
//
//            // War events surface globally even without location data
//            isWar -> 500.0
//
//            else -> null
//        }
//    }

    private data class GeoMatch(val distanceKm: Double, val proximityKnown: Boolean)

    private fun computeDistance(
        event: NormalizedSafetyEvent,
        userCoords: Pair<Double, Double>?,
        userCountry: String
    ): GeoMatch? {
        val isWar = event.category in WAR_CATEGORIES
        return when {
            // Real coordinates → real distance
            event.latitude != null && event.longitude != null && userCoords != null -> {
                val dist = haversineKm(userCoords.first, userCoords.second, event.latitude, event.longitude)
                if (dist <= 500.0 || isWar) GeoMatch(dist, proximityKnown = true) else null
            }
            // Same country, no coords → 150 for the label, but distance is NOT measured
            event.country != null && userCountry.isNotBlank() -> {
                val ec = event.country.lowercase().trim()
                val same = ec.contains(userCountry) || userCountry.contains(ec)
                if (same || isWar) GeoMatch(150.0, proximityKnown = false) else null
            }
            // War with no location → surface globally
            isWar -> GeoMatch(500.0, proximityKnown = false)
            else  -> null
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun presenceRegion(user: com.ollia.entity.User): String? {
        if (user.travelMode && !user.travelDestination.isNullOrBlank()) {
            return user.travelDestination
        }
        return user.region
    }

    /** City shown to circle peers — blank when the member opted out of sharing. */
    private fun displayRegion(user: com.ollia.entity.User): String {
        if (!user.shareRegion) return ""
        return presenceRegion(user) ?: ""
    }

    private fun riskOrdinal(level: String) = when (level) {
        "IMPORTANT_DISRUPTION" -> 2
        "STAY_AWARE"           -> 1
        else                   -> 0
    }

    private fun extractCountry(region: String?): String {
        if (region.isNullOrBlank()) return ""
        return if (region.contains(",")) {
            region.substringAfterLast(",").trim().lowercase()
        } else {
            region.trim().lowercase()
        }
    }

    private fun approximateCoords(region: String?): Pair<Double, Double>? {
        if (region.isNullOrBlank()) return null
        return CITY_COORDS.entries.firstOrNull {
            region.contains(it.key, ignoreCase = true)
        }?.value
    }

    private fun buildSourcesLabel(
        sourceIds: List<String>,
        registry: Map<String, com.ollia.entity.SaiaeSourceRegistry>
    ): String {
        val names = sourceIds.mapNotNull { registry[it]?.name }.distinct().take(2)
        return when {
            names.size >= 2 -> "Confirmed by ${names[0]} & ${names[1]}"
            names.size == 1 -> "Confirmed by ${names[0]}"
            else            -> "Confirmed by trusted sources"
        }
    }

    private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return R * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun eventLabel(cat: SafetyCategory): String = when (cat) {
        SafetyCategory.MISSILE_ATTACK        -> "Missile Attack"
        SafetyCategory.ARMED_CONFLICT        -> "Armed Conflict"
        SafetyCategory.WAR                   -> "Armed Conflict"
        SafetyCategory.TERRORISM             -> "Security Incident"
        SafetyCategory.EXPLOSION             -> "Explosion"
        SafetyCategory.ACTIVE_SHOOTER        -> "Active Shooter"
        SafetyCategory.VIOLENCE              -> "Security Incident"
        SafetyCategory.PROTEST               -> "Protest Activity"
        SafetyCategory.RIOT                  -> "Riot"
        SafetyCategory.CIVIL_UNREST          -> "Civil Unrest"
        SafetyCategory.CURFEW                -> "Curfew"
        SafetyCategory.EARTHQUAKE            -> "Earthquake"
        SafetyCategory.FLOOD                 -> "Flood"
        SafetyCategory.WILDFIRE              -> "Wildfire"
        SafetyCategory.HURRICANE             -> "Hurricane"
        SafetyCategory.TORNADO               -> "Tornado"
        SafetyCategory.EXTREME_WEATHER       -> "Severe Weather"
        SafetyCategory.TSUNAMI               -> "Tsunami"
        SafetyCategory.VOLCANO               -> "Volcanic Activity"
        SafetyCategory.TRANSPORT_DISRUPTION  -> "Transport Disruption"
        SafetyCategory.BLACKOUT              -> "Power Outage"
        SafetyCategory.INTERNET_OUTAGE       -> "Internet Outage"
        SafetyCategory.AIRPORT_DISRUPTION    -> "Airport Disruption"
        SafetyCategory.HEALTH_ALERT          -> "Health Emergency"
        SafetyCategory.EPIDEMIC              -> "Epidemic Alert"
        SafetyCategory.PANDEMIC              -> "Pandemic Alert"
        SafetyCategory.BORDER_TENSION        -> "Border Closure"
        else                                 -> "Safety Alert"
    }

    companion object {
        private val WAR_CATEGORIES = setOf(
            SafetyCategory.MISSILE_ATTACK,
            SafetyCategory.ARMED_CONFLICT,
            SafetyCategory.WAR
        )

        private val CITY_COORDS: Map<String, Pair<Double, Double>> = mapOf(
            "nairobi"        to Pair(-1.3,   36.8),
            "lagos"          to Pair(6.5,    3.4),
            "cairo"          to Pair(30.1,   31.2),
            "algiers"        to Pair(36.7,   3.1),
            "casablanca"     to Pair(33.6,  -7.6),
            "johannesburg"   to Pair(-26.2,  28.0),
            "cape town"      to Pair(-33.9,  18.4),
            "tunis"          to Pair(36.8,   10.2),
            "dubai"          to Pair(25.2,   55.3),
            "abu dhabi"      to Pair(24.5,   54.4),
            "riyadh"         to Pair(24.7,   46.7),
            "beirut"         to Pair(33.9,   35.5),
            "tehran"         to Pair(35.7,   51.4),
            "paris"          to Pair(48.9,   2.3),
            "london"         to Pair(51.5,  -0.1),
            "berlin"         to Pair(52.5,   13.4),
            "madrid"         to Pair(40.4,  -3.7),
            "rome"           to Pair(41.9,   12.5),
            "amsterdam"      to Pair(52.4,   4.9),
            "istanbul"       to Pair(41.0,   29.0),
            "moscow"         to Pair(55.8,   37.6),
            "tokyo"          to Pair(35.7,   139.7),
            "beijing"        to Pair(39.9,   116.4),
            "delhi"          to Pair(28.7,   77.1),
            "mumbai"         to Pair(19.1,   72.9),
            "karachi"        to Pair(24.9,   67.0),
            "bangkok"        to Pair(13.8,   100.5),
            "jakarta"        to Pair(-6.2,   106.8),
            "singapore"      to Pair(1.4,    103.8),
            "manila"         to Pair(14.6,   121.0),
            "seoul"          to Pair(37.6,   127.0),
            "da nang"        to Pair(16.1,   108.2),
            "hanoi"          to Pair(21.0,   105.8),
            "ho chi minh"    to Pair(10.8,   106.7),
            "bali"           to Pair(-8.4,   115.2),
            "new york"       to Pair(40.7,  -74.0),
            "los angeles"    to Pair(34.1,  -118.2),
            "chicago"        to Pair(41.9,  -87.6),
            "toronto"        to Pair(43.7,  -79.4),
            "sydney"         to Pair(-33.9,  151.2),
            "melbourne"      to Pair(-37.8,  145.0),
            "lille"          to Pair(50.6,   3.1),
            "saint-julien"   to Pair(46.1,   6.1),
        )
    }
}
