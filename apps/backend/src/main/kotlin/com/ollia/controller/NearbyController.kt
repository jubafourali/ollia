package com.ollia.controller

import com.ollia.dto.CoverageResponse
import com.ollia.dto.NearbyEventResponse
import com.ollia.dto.NearbyMemberResponse
import com.ollia.dto.NearbyRegionResponse
import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.LocationRelevance
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.geo.CoveragePolicy
import com.ollia.geo.PlaceResolver
import com.ollia.geo.PlaceSituationService
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.UserRepository
import com.ollia.saiae.context.ContextIntelligenceService
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import com.ollia.saiae.risk.RiskAssessmentService
import com.ollia.service.CurrentUserService
import com.ollia.util.GeoUtils
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

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
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val sourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val riskEngine: RiskAssessmentService,
    private val contextEngine: ContextIntelligenceService,
    private val placeSituationService: PlaceSituationService,
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
            val place = PlaceResolver.resolve(presenceRegion)
            val userCoords = if (place?.hasCoords == true) place.latitude!! to place.longitude!! else null
            val userCountry = place?.country.orEmpty()

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
        val place = PlaceResolver.resolve(trimmed)
        val coverage = CoveragePolicy.forPlace(place?.country ?: trimmed)
        val coverageDto = CoverageResponse(
            country = coverage.country,
            packId = coverage.packId,
            packLabel = coverage.packLabel,
            promise = coverage.promise,
            hazardsCovered = coverage.hazardsCovered,
            hazardsNotCovered = coverage.hazardsNotCovered,
            coveredLabels = coverage.coveredLabels,
            notCoveredLabels = coverage.notCoveredLabels,
            gapChips = coverage.gapChips,
            sourcesActive = coverage.sourcesActive,
            disclaimer = coverage.disclaimer,
        )
        val placeLabel = place?.city?.takeIf { it.isNotBlank() }
            ?: trimmed.substringBefore(",").trim().ifBlank { "this area" }

        fun respond(
            worstRisk: String,
            summary: String,
            events: List<NearbyEventResponse>,
        ): ResponseEntity<NearbyRegionResponse> {
            val situation = placeSituationService.build(
                place = place,
                placeLabel = placeLabel,
                coverage = coverage,
                worstRisk = worstRisk,
                alertCount = events.size,
                topAlertSentence = events.firstOrNull()?.sentence,
            )
            // Prefer situation overall as summary when quiet — "being there" first.
            val effectiveSummary = if (events.isEmpty()) situation.overall else summary
            return ResponseEntity.ok(
                NearbyRegionResponse(trimmed, worstRisk, effectiveSummary, events, coverageDto, situation)
            )
        }

        if (trimmed.isBlank()) {
            return respond("NORMAL", CoveragePolicy.checkedAndClearSummary(placeLabel, coverage), emptyList())
        }

        val verifiedEvents = normalizedRepo.findAllByStatus(EventStatus.VERIFIED)
        if (verifiedEvents.isEmpty()) {
            return respond("NORMAL", CoveragePolicy.checkedAndClearSummary(placeLabel, coverage), emptyList())
        }

        val verifiedEventIds = verifiedEvents.mapNotNull { it.id }
        val confidenceByEventId = confidenceReportRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .associateBy { it.normalizedEventId }
        val sourceRegistry = sourceRegistryRepo.findAll().associateBy { it.id }
        val matchesByEventId = sourceMatchRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .groupBy { it.normalizedEventId }

        val userCoords = if (place?.hasCoords == true) place.latitude!! to place.longitude!! else null
        val userCountry = place?.country.orEmpty()

        val events = verifiedEvents.mapNotNull { event ->
            val confidence = confidenceByEventId[event.id] ?: return@mapNotNull null

            val match = computeDistance(event, userCoords, userCountry) ?: return@mapNotNull null
            val isWar = event.category in WAR_CATEGORIES
            val relevance = when {
                match.proximityKnown && match.distanceKm <= 50 -> LocationRelevance.SAME_CITY
                PlaceResolver.countryMatches(event.country, userCountry) -> LocationRelevance.SAME_COUNTRY
                match.distanceKm <= 500 -> LocationRelevance.BORDER_REGION
                else -> LocationRelevance.DISTANT
            }

            val risk = riskEngine.assess(event, confidence, match.distanceKm, proximityKnown = match.proximityKnown)
            val warFloored = isWar && PlaceResolver.countryMatches(event.country, userCountry)
            val effectiveRisk = if (warFloored) RiskLevel.IMPORTANT_DISRUPTION else risk.riskLevel
            if (effectiveRisk == RiskLevel.NORMAL) return@mapNotNull null

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
        val summary = events.firstOrNull()?.sentence
            ?: CoveragePolicy.checkedAndClearSummary(placeLabel, coverage)

        return respond(worstRisk, summary, events)
    }

    /**
     * GET /api/v2/nearby/coverage?region=Paris,+France
     *
     * Lightweight coverage pack for Settings / Family without loading the event feed.
     */
    @GetMapping("/coverage")
    fun getCoverage(@RequestParam region: String): ResponseEntity<CoverageResponse> {
        currentUserService.getCurrentUser()
        val place = PlaceResolver.resolve(region.trim())
        val coverage = CoveragePolicy.forPlace(place?.country ?: region.trim())
        return ResponseEntity.ok(
            CoverageResponse(
                country = coverage.country,
                packId = coverage.packId,
                packLabel = coverage.packLabel,
                promise = coverage.promise,
                hazardsCovered = coverage.hazardsCovered,
                hazardsNotCovered = coverage.hazardsNotCovered,
                coveredLabels = coverage.coveredLabels,
                notCoveredLabels = coverage.notCoveredLabels,
                gapChips = coverage.gapChips,
                sourcesActive = coverage.sourcesActive,
                disclaimer = coverage.disclaimer,
            )
        )
    }

    private data class GeoMatch(val distanceKm: Double, val proximityKnown: Boolean)

    private fun computeDistance(
        event: NormalizedSafetyEvent,
        userCoords: Pair<Double, Double>?,
        userCountry: String
    ): GeoMatch? {
        val isWar = event.category in WAR_CATEGORIES
        return when {
            event.latitude != null && event.longitude != null && userCoords != null -> {
                val dist = GeoUtils.haversineKm(
                    userCoords.first, userCoords.second,
                    event.latitude, event.longitude
                )
                if (dist <= 500.0 || isWar) GeoMatch(dist, proximityKnown = true) else null
            }
            event.country != null && userCountry.isNotBlank() -> {
                val same = PlaceResolver.countryMatches(event.country, userCountry)
                if (same || isWar) GeoMatch(150.0, proximityKnown = false) else null
            }
            isWar -> GeoMatch(500.0, proximityKnown = false)
            else -> null
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
    }
}
