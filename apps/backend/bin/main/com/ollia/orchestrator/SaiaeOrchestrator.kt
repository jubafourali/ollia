package com.ollia.orchestrator

import com.ollia.entity.EventStatus
import com.ollia.entity.LocationRelevance
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.User
import com.ollia.geo.PlaceResolver
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.UserRepository
import com.ollia.saiae.composer.CalmOutputComposerService
import com.ollia.saiae.context.ContextIntelligenceService
import com.ollia.saiae.correlation.EventCorrelationService
import com.ollia.saiae.police.PoliceEngineService
import com.ollia.entity.SaiaeSourceRegistry
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeContextReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import com.ollia.saiae.risk.RiskAssessmentService
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * SAIAE Pipeline Orchestrator — runs every 2 minutes.
 *
 * TWO-PASS PIPELINE:
 *
 * PASS 1 — Global verification (independent of users)
 *   All PENDING_VERIFICATION events are scored by the Police Engine.
 *   Verification is a global operation — an earthquake in Tokyo is
 *   VERIFIED regardless of whether any Ollia user is in Tokyo.
 *   Result: events become VERIFIED or REJECTED.
 *
 * PASS 2 — Per-user relevance and card composition
 *   For each watched user, find VERIFIED events near their location.
 *   Compose alert cards only for events that are geographically relevant.
 *   A US flood is ONLY shown if someone in the circle is in the US.
 *   A Kenya earthquake is ONLY shown if someone in the circle is in Kenya.
 */
@Service
class SaiaeOrchestrator(
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val contextReportRepo: SaiaeContextReportRepository,
    private val eventSourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val userRepository: UserRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val correlationService: EventCorrelationService,
    private val policeEngine: PoliceEngineService,
    private val riskEngine: RiskAssessmentService,
    private val contextEngine: ContextIntelligenceService,
    private val composer: CalmOutputComposerService
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    val warEventCategories = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR,
    )

    @Scheduled(fixedRate = 120_000)
    @Transactional
    fun runPipeline() {
        // ── PASS 1: CORRELATION + GLOBAL VERIFICATION ────────────────────────
        // Correlation clusters sibling reports into canonical events (multi-source).
        // Verification is global and runs regardless of whether any user is nearby.
        val toScore = correlationService.correlate()
        var verified = 0
        var rejected = 0
        for (event in toScore) {
            try {
                val report = policeEngine.scoreEvent(event)
                if (report.minimumSourcesMet) {
                    verified++
                    // Persist a global, user-independent base risk (distance 0 = at-source
                    // intrinsic severity) for tuning/analytics. Per-user *effective* risk is
                    // computed in Pass 2 and stored per observer in saiae_context_report.
                    val baseRisk = riskEngine.assess(event, report, distanceKm = 0.0)
                    normalizedRepo.updateRisk(
                        event.id!!, baseRisk.riskLevel.name, baseRisk.finalScore, baseRisk.floorApplied
                    )
                } else {
                    rejected++
                }
            } catch (e: Exception) {
                logger.error("Police Engine failed for event ${event.id}", e)
            }
        }
        if (toScore.isNotEmpty()) {
            logger.info("Pass 1: ${toScore.size} canonical events scored, $verified verified, $rejected rejected")
        }

        // ── PASS 2: PER-USER RELEVANCE AND CARD COMPOSITION ──────────────────
        // Only VERIFIED canonical events from here on (MERGED/REJECTED are inert).
        val allUsers = userRepository.findAll()
        if (allUsers.isEmpty()) return

        val verifiedEvents = normalizedRepo.findAllByStatusIn(listOf(EventStatus.VERIFIED))
        if (verifiedEvents.isEmpty()) {
            logger.info("Pass 2: no verified events to surface")
            return
        }

        // Pre-load confidence reports + the (small, static) source registry once,
        // scoped to the verified event set — no full-table scans, no per-compose lookups.
        val verifiedEventIds = verifiedEvents.mapNotNull { it.id }
        val confidenceByEventId = confidenceReportRepo.findAllByNormalizedEventIdIn(verifiedEventIds)
            .associateBy { it.normalizedEventId }
        val registry = sourceRegistryRepo.findAll().associateBy { it.id }

        for (watchedUser in allUsers) {
            try {
                val observers = findCircleObservers(watchedUser, allUsers)
                if (observers.isEmpty()) continue

                // Travel mode: geo against the destination the circle already sees.
                val presenceRegion = presenceRegion(watchedUser)
                val place = PlaceResolver.resolve(presenceRegion)
                val userCoords = if (place?.hasCoords == true) {
                    place.latitude!! to place.longitude!!
                } else null
                val userCountry = place?.country?.lowercase()?.trim().orEmpty()

                for (event in verifiedEvents) {
                    try {
                        val confidence = confidenceByEventId[event.id] ?: continue
                        processVerifiedEventForUser(
                            event       = event,
                            confidence  = confidence,
                            watchedUser = watchedUser,
                            observers   = observers,
                            userCoords  = userCoords,
                            userCountry = userCountry,
                            registry    = registry
                        )
                    } catch (e: Exception) {
                        logger.error("Pass 2 failed for user ${watchedUser.id} event ${event.id}", e)
                    }
                }
            } catch (e: Exception) {
                logger.error("Pass 2 failed for watched user ${watchedUser.id}", e)
            }
        }
    }

    private fun processVerifiedEventForUser(
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        watchedUser: User,
        observers: List<User>,
        userCoords: Pair<Double, Double>?,
        userCountry: String,
        registry: Map<String, SaiaeSourceRegistry>
    ) {
        val isWar = event.category in warEventCategories

        // Skip if user has no presence region and it's not a war event
        if (presenceRegion(watchedUser).isNullOrBlank() && !isWar) return

        // ── LOCATION RELEVANCE ────────────────────────────────────────────────
        val distanceKm: Double
        val locationRelevance: LocationRelevance
        val proximityKnown: Boolean

        when {
            event.latitude != null && event.longitude != null && userCoords != null -> {
                distanceKm = riskEngine.haversineKm(
                    userCoords.first, userCoords.second, event.latitude, event.longitude
                )
                proximityKnown = true
                locationRelevance = when {
                    distanceKm <= 50  -> LocationRelevance.SAME_CITY
                    distanceKm <= 300 -> LocationRelevance.SAME_COUNTRY
                    distanceKm <= 500 -> LocationRelevance.BORDER_REGION
                    else              -> LocationRelevance.DISTANT
                }
            }
            event.country != null -> {
                locationRelevance = when {
                    PlaceResolver.countryMatches(event.country, userCountry) -> LocationRelevance.SAME_COUNTRY
                    else -> LocationRelevance.DISTANT
                }
                distanceKm = if (locationRelevance == LocationRelevance.DISTANT) 9999.0 else 150.0
                proximityKnown = false
            }
            else -> {
                locationRelevance = LocationRelevance.UNKNOWN
                distanceKm = 9999.0
                proximityKnown = false
            }
        }

        // Skip distant/unknown events (non-war)
        if (locationRelevance == LocationRelevance.DISTANT && !isWar) return
        if (locationRelevance == LocationRelevance.UNKNOWN && !isWar) return

        // ── RISK ASSESSMENT ───────────────────────────────────────────────────
        val risk = riskEngine.assess(event, confidence, distanceKm, proximityKnown = proximityKnown)
        if (risk.riskLevel == RiskLevel.NORMAL && !isWar) return

        val sourceMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id!!)

        // ── COMPOSE CARD FOR EACH OBSERVER ────────────────────────────────────
        for (observer in observers) {
            try {
                val context = contextEngine.compute(
                    memberName        = watchedUser.name,
                    event             = event,
                    risk              = risk,
                    confidence        = confidence,
                    user              = watchedUser,
                    locationRelevance = locationRelevance,
                    distanceKm        = distanceKm,
                )

                contextReportRepo.upsert(
                    eventId      = event.id,
                    userId       = observer.id!!,
                    risk         = context.effectiveRisk.name,
                    floor        = context.floorApplied,
                    status       = context.userStatus.name,
                    location     = context.locationRelevance.name,
                    sentence     = context.calmSentence,
                    pushEligible = context.pushEligible
                )

                composer.compose(
                    watchedUser    = watchedUser,
                    circleObserver = observer,
                    event          = event,
                    context        = context,
                    confidence     = confidence,
                    sourceMatches  = sourceMatches,
                    registry       = registry
                )
            } catch (e: Exception) {
                logger.error("Compose failed for observer ${observer.id}", e)
            }
        }
    }

    /**
     * Everyone else who shares a circle with [watchedUser] — peers, not only owners.
     * Cards and pushes are keyed by observer; owners-only left the rest of the circle blind.
     */
    private fun findCircleObservers(watchedUser: User, allUsers: List<User>): List<User> {
        val circleIds = familyMemberRepository
            .findAllByUserId(watchedUser.id!!)
            .map { it.circleId }
            .distinct()
        if (circleIds.isEmpty()) return emptyList()
        val peerIds = familyMemberRepository
            .findAllByCircleIdIn(circleIds)
            .map { it.userId }
            .filter { it != watchedUser.id }
            .toSet()
        return allUsers.filter { it.id in peerIds }
    }

    /** Region used for geo relevance: travel destination when traveling, else home. */
    private fun presenceRegion(user: User): String? {
        if (user.travelMode && !user.travelDestination.isNullOrBlank()) {
            return user.travelDestination
        }
        return user.region
    }
}