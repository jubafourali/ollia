package com.ollia.orchestrator

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.User
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.UserRepository
import com.ollia.saiae.composer.CalmOutputComposerService
import com.ollia.saiae.context.ContextIntelligenceService
import com.ollia.saiae.police.PoliceEngineService
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeContextReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.risk.RiskAssessmentService
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service

/**
 * SAIAE Pipeline Orchestrator — runs every 2 minutes.
 *
 * For each verified event:
 *   1. Police Engine → score confidence (if not yet scored)
 *   2. Risk Assessment → score risk per user proximity
 *   3. Context Intelligence → compute calm sentence + push eligibility
 *   4. Calm Output Composer → build card, handle dedup, fire push
 */
@Service
class SaiaeOrchestrator(
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val contextReportRepo: SaiaeContextReportRepository,
    private val eventSourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val userRepository: UserRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyCircleRepository: FamilyCircleRepository,
    private val policeEngine: PoliceEngineService,
    private val riskEngine: RiskAssessmentService,
    private val contextEngine: ContextIntelligenceService,
    private val composer: CalmOutputComposerService
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedRate = 120_000)
    @Transactional
    fun runPipeline() {
        val events = normalizedRepo.findAllByStatusIn(
            listOf(EventStatus.PENDING_VERIFICATION, EventStatus.VERIFIED)
        )
        if (events.isEmpty()) return
        logger.info("SAIAE pipeline: processing ${events.size} events")

        for (event in events) {
            try {
                processEvent(event)
            } catch (e: Exception) {
                logger.error("SAIAE pipeline failed for event ${event.id} (${event.category})", e)
            }
        }
    }

    private fun processEvent(event: NormalizedSafetyEvent) {
        // 1. Police Engine — score confidence (idempotent)
        val confidence: SaiaeConfidenceReport =
            confidenceReportRepo.findByNormalizedEventId(event.id!!)
                ?: policeEngine.scoreEvent(event)

        // Skip events that were blocked by the Police Engine
        if (!confidence.minimumSourcesMet) return

        // 2. Find all users who have a circle member who could be affected
        val allUsers = userRepository.findAll()
        val sourceMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id)

        for (watchedUser in allUsers) {
            try {
                processForUser(event, confidence, watchedUser, sourceMatches, allUsers)
            } catch (e: Exception) {
                logger.error("SAIAE context failed for user ${watchedUser.id} event ${event.id}", e)
            }
        }
    }

    private fun processForUser(
        event: NormalizedSafetyEvent,
        confidence: SaiaeConfidenceReport,
        watchedUser: User,
        sourceMatches: List<SaiaeEventSourceMatch>,
        allUsers: List<User>
    ) {
        // 3. Risk Assessment — distance from watchedUser to event
        val distanceKm = if (event.latitude != null && event.longitude != null) {
            val userCoords = approximateUserCoords(watchedUser.region)
            if (userCoords != null) {
                riskEngine.haversineKm(
                    userCoords.first, userCoords.second,
                    event.latitude, event.longitude
                )
            } else 50.0  // unknown city → assume moderate proximity
        } else 50.0

        val risk = riskEngine.assess(event, confidence, distanceKm)

        // Skip NORMAL risk events for non-war categories (never shown)
        val isWar = event.category in riskEngine.warEventCategories
        if (risk.riskLevel == RiskLevel.NORMAL && !isWar) return

        // 4. Find all circle observers who follow this watchedUser
        val circleObservers = findCircleObservers(watchedUser, allUsers)
        if (circleObservers.isEmpty()) return

        for (observer in circleObservers) {
            try {
                // Context intelligence — from observer's perspective
                val context = contextEngine.compute(
                    memberName = watchedUser.name,
                    event      = event,
                    risk       = risk,
                    confidence = confidence,
                    user       = watchedUser   // watched person's activity
                )

                // Persist context report
                contextReportRepo.upsert(
                    eventId     = event.id!!,
                    userId      = observer.id!!,
                    risk        = context.effectiveRisk.name,
                    floor       = context.floorApplied,
                    status      = context.userStatus.name,
                    location    = context.locationRelevance.name,
                    sentence    = context.calmSentence,
                    pushEligible = context.pushEligible
                )

                // Compose card + maybe push
                composer.compose(
                    watchedUser    = watchedUser,
                    circleObserver = observer,
                    event          = event,
                    context        = context,
                    confidence     = confidence,
                    sourceMatches  = sourceMatches
                )
            } catch (e: Exception) {
                logger.error("SAIAE compose failed for observer ${observer.id}", e)
            }
        }
    }

    /**
     * Find all users who have watchedUser in their family circle.
     * These are the people who should receive alerts about watchedUser.
     */
    private fun findCircleObservers(watchedUser: User, allUsers: List<User>): List<User> {
        // Circles where watchedUser is a member
        val circleIds = familyMemberRepository
            .findAllByUserId(watchedUser.id!!)
            .map { it.circleId }
            .distinct()

        if (circleIds.isEmpty()) return emptyList()

        // Owners of those circles — they are the observers
        val circles = familyCircleRepository.findAllById(circleIds)
        val ownerIds = circles.map { it.ownerId }.filter { it != watchedUser.id }.toSet()

        return allUsers.filter { it.id in ownerIds }
    }

    private fun approximateUserCoords(region: String?): Pair<Double, Double>? {
        if (region == null) return null
        return MAJOR_CITIES.entries.firstOrNull {
            region.contains(it.key, ignoreCase = true)
        }?.value
    }

    companion object {
        private val MAJOR_CITIES: Map<String, Pair<Double, Double>> = mapOf(
            "dubai"        to Pair(25.2, 55.3),
            "abu dhabi"    to Pair(24.5, 54.4),
            "riyadh"       to Pair(24.7, 46.7),
            "beirut"       to Pair(33.9, 35.5),
            "cairo"        to Pair(30.1, 31.2),
            "algiers"      to Pair(36.7, 3.1),
            "paris"        to Pair(48.9, 2.3),
            "london"       to Pair(51.5, -0.1),
            "berlin"       to Pair(52.5, 13.4),
            "new york"     to Pair(40.7, -74.0),
            "toronto"      to Pair(43.7, -79.4),
            "sydney"       to Pair(-33.9, 151.2),
            "tokyo"        to Pair(35.7, 139.7),
            "istanbul"     to Pair(41.0, 29.0),
            "kyiv"         to Pair(50.5, 30.5),
            "moscow"       to Pair(55.8, 37.6),
            "tehran"       to Pair(35.7, 51.4)
        )
    }
}