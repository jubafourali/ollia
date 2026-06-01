package com.ollia.orchestrator

import com.ollia.entity.EventStatus
import com.ollia.entity.LocationRelevance
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
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
    private val userRepository: UserRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyCircleRepository: FamilyCircleRepository,
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
        val allEvents = normalizedRepo.findAllByStatusIn(
            listOf(EventStatus.PENDING_VERIFICATION, EventStatus.VERIFIED)
        )
        if (allEvents.isEmpty()) return

        val allUsers = userRepository.findAll()
        if (allUsers.isEmpty()) return

        logger.info("SAIAE pipeline: ${allEvents.size} events, ${allUsers.size} users")

        // ── PASS 1: GLOBAL VERIFICATION ──────────────────────────────────────
        // Score every PENDING_VERIFICATION event independently of any user.
        // This promotes events to VERIFIED or REJECTED globally.
        val pendingEvents = allEvents.filter { it.status == EventStatus.PENDING_VERIFICATION }
        var verified = 0
        var rejected = 0
        for (event in pendingEvents) {
            try {
                val existing = confidenceReportRepo.findByNormalizedEventId(event.id!!)
                if (existing != null) continue // already scored
                val report = policeEngine.scoreEvent(event)
                if (report.minimumSourcesMet) verified++ else rejected++
            } catch (e: Exception) {
                logger.error("Police Engine failed for event ${event.id}", e)
            }
        }
        if (pendingEvents.isNotEmpty()) {
            logger.info("Pass 1 complete: ${pendingEvents.size} scored, $verified verified, $rejected rejected")
        }

        // ── PASS 2: PER-USER RELEVANCE AND CARD COMPOSITION ──────────────────
        // Only work with VERIFIED events from this point forward.
        // Re-fetch so we pick up the newly verified events from Pass 1.
        val verifiedEvents = normalizedRepo.findAllByStatusIn(listOf(EventStatus.VERIFIED))
        if (verifiedEvents.isEmpty()) {
            logger.info("Pass 2: no verified events to surface")
            return
        }

        // Pre-load all confidence reports to avoid N+1 queries in Pass 2.
        // SaiaeConfidenceReportRepository only exposes findAll() for bulk load —
        // filter in-memory to the verified event set (small set at any given time).
        val verifiedEventIds = verifiedEvents.map { it.id!! }.toSet()
        val confidenceByEventId = confidenceReportRepo.findAll()
            .filter { it.normalizedEventId in verifiedEventIds }
            .associateBy { it.normalizedEventId }

        for (watchedUser in allUsers) {
            try {
                val observers = findCircleObservers(watchedUser, allUsers)
                if (observers.isEmpty()) continue

                val userCoords = approximateUserCoords(watchedUser.region)
                val userCountry = extractCountry(watchedUser.region)

                for (event in verifiedEvents) {
                    try {
                        val confidence = confidenceByEventId[event.id] ?: continue
                        processVerifiedEventForUser(
                            event       = event,
                            confidence  = confidence,
                            watchedUser = watchedUser,
                            observers   = observers,
                            userCoords  = userCoords,
                            userCountry = userCountry
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
        userCountry: String
    ) {
        val isWar = event.category in warEventCategories

        // Skip if user has no region and it's not a war event
        if (watchedUser.region.isNullOrBlank() && !isWar) return

        // ── LOCATION RELEVANCE ────────────────────────────────────────────────
        val distanceKm: Double
        val locationRelevance: LocationRelevance

        when {
            event.latitude != null && event.longitude != null && userCoords != null -> {
                distanceKm = riskEngine.haversineKm(
                    userCoords.first, userCoords.second,
                    event.latitude, event.longitude
                )
                locationRelevance = when {
                    distanceKm <= 50   -> LocationRelevance.SAME_CITY
                    distanceKm <= 300  -> LocationRelevance.SAME_COUNTRY
                    distanceKm <= 500  -> LocationRelevance.BORDER_REGION
                    else               -> LocationRelevance.DISTANT
                }
            }

            event.country != null -> {
                val eventCountry = event.country.lowercase().trim()
                locationRelevance = when {
                    userCountry.isNotBlank() && eventCountry.contains(userCountry) -> LocationRelevance.SAME_COUNTRY
                    userCountry.isNotBlank() && userCountry.contains(eventCountry) -> LocationRelevance.SAME_COUNTRY
                    else                                                            -> LocationRelevance.DISTANT
                }
                distanceKm = if (locationRelevance == LocationRelevance.DISTANT) 9999.0 else 150.0
            }

            else -> {
                locationRelevance = LocationRelevance.UNKNOWN
                distanceKm = 9999.0
            }
        }

        // Skip distant/unknown events (non-war)
        if (locationRelevance == LocationRelevance.DISTANT && !isWar) return
        if (locationRelevance == LocationRelevance.UNKNOWN && !isWar) return

        // ── RISK ASSESSMENT ───────────────────────────────────────────────────
        val risk = riskEngine.assess(event, confidence, distanceKm)
        if (risk.riskLevel == RiskLevel.NORMAL && !isWar) return

        val sourceMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id!!)

        // ── COMPOSE CARD FOR EACH OBSERVER ────────────────────────────────────
        for (observer in observers) {
            try {
                val context = contextEngine.compute(
                    memberName = watchedUser.name,
                    event      = event,
                    risk       = risk,
                    confidence = confidence,
                    user       = watchedUser
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
                    sourceMatches  = sourceMatches
                )
            } catch (e: Exception) {
                logger.error("Compose failed for observer ${observer.id}", e)
            }
        }
    }

    private fun findCircleObservers(watchedUser: User, allUsers: List<User>): List<User> {
        val circleIds = familyMemberRepository
            .findAllByUserId(watchedUser.id!!)
            .map { it.circleId }
            .distinct()
        if (circleIds.isEmpty()) return emptyList()
        val circles  = familyCircleRepository.findAllById(circleIds)
        val ownerIds = circles.map { it.ownerId }.filter { it != watchedUser.id }.toSet()
        return allUsers.filter { it.id in ownerIds }
    }

    private fun extractCountry(region: String?): String {
        if (region.isNullOrBlank()) return ""
        return if (region.contains(",")) {
            region.substringAfterLast(",").trim().lowercase()
        } else {
            region.trim().lowercase()
        }
    }

    private fun approximateUserCoords(region: String?): Pair<Double, Double>? {
        if (region.isNullOrBlank()) return null
        return CITY_COORDS.entries.firstOrNull {
            region.contains(it.key, ignoreCase = true)
        }?.value
    }

    companion object {
        private val CITY_COORDS: Map<String, Pair<Double, Double>> = mapOf(
            // Africa
            "nairobi"        to Pair(-1.3,   36.8),
            "lagos"          to Pair(6.5,    3.4),
            "cairo"          to Pair(30.1,   31.2),
            "algiers"        to Pair(36.7,   3.1),
            "casablanca"     to Pair(33.6,  -7.6),
            "accra"          to Pair(5.6,   -0.2),
            "dakar"          to Pair(14.7,  -17.4),
            "addis ababa"    to Pair(9.0,   38.7),
            "johannesburg"   to Pair(-26.2,  28.0),
            "cape town"      to Pair(-33.9,  18.4),
            "tunis"          to Pair(36.8,   10.2),
            "tripoli"        to Pair(32.9,   13.2),
            "khartoum"       to Pair(15.6,   32.5),
            "kampala"        to Pair(0.3,    32.6),
            "dar es salaam"  to Pair(-6.8,   39.3),
            // Middle East
            "dubai"          to Pair(25.2,   55.3),
            "abu dhabi"      to Pair(24.5,   54.4),
            "riyadh"         to Pair(24.7,   46.7),
            "beirut"         to Pair(33.9,   35.5),
            "amman"          to Pair(31.9,   35.9),
            "baghdad"        to Pair(33.3,   44.4),
            "damascus"       to Pair(33.5,   36.3),
            "tehran"         to Pair(35.7,   51.4),
            "tel aviv"       to Pair(32.1,   34.8),
            "jerusalem"      to Pair(31.8,   35.2),
            "doha"           to Pair(25.3,   51.5),
            "muscat"         to Pair(23.6,   58.6),
            "sanaa"          to Pair(15.4,   44.2),
            "kuwait"         to Pair(29.4,   48.0),
            // Europe
            "paris"          to Pair(48.9,   2.3),
            "london"         to Pair(51.5,  -0.1),
            "berlin"         to Pair(52.5,   13.4),
            "madrid"         to Pair(40.4,  -3.7),
            "rome"           to Pair(41.9,   12.5),
            "amsterdam"      to Pair(52.4,   4.9),
            "brussels"       to Pair(50.8,   4.4),
            "vienna"         to Pair(48.2,   16.4),
            "zurich"         to Pair(47.4,   8.5),
            "stockholm"      to Pair(59.3,   18.1),
            "oslo"           to Pair(59.9,   10.7),
            "copenhagen"     to Pair(55.7,   12.6),
            "warsaw"         to Pair(52.2,   21.0),
            "prague"         to Pair(50.1,   14.4),
            "budapest"       to Pair(47.5,   19.0),
            "bucharest"      to Pair(44.4,   26.1),
            "athens"         to Pair(37.9,   23.7),
            "istanbul"       to Pair(41.0,   29.0),
            "kyiv"           to Pair(50.5,   30.5),
            "moscow"         to Pair(55.8,   37.6),
            "lisbon"         to Pair(38.7,  -9.1),
            // Asia
            "tokyo"          to Pair(35.7,   139.7),
            "beijing"        to Pair(39.9,   116.4),
            "shanghai"       to Pair(31.2,   121.5),
            "delhi"          to Pair(28.7,   77.1),
            "mumbai"         to Pair(19.1,   72.9),
            "karachi"        to Pair(24.9,   67.0),
            "dhaka"          to Pair(23.8,   90.4),
            "kabul"          to Pair(34.5,   69.2),
            "islamabad"      to Pair(33.7,   73.1),
            "colombo"        to Pair(6.9,    79.9),
            "bangkok"        to Pair(13.8,   100.5),
            "jakarta"        to Pair(-6.2,   106.8),
            "singapore"      to Pair(1.4,    103.8),
            "manila"         to Pair(14.6,   121.0),
            "seoul"          to Pair(37.6,   127.0),
            "kuala lumpur"   to Pair(3.1,    101.7),
            "ho chi minh"    to Pair(10.8,   106.7),
            "yangon"         to Pair(16.8,   96.2),
            // Americas
            "new york"       to Pair(40.7,  -74.0),
            "los angeles"    to Pair(34.1,  -118.2),
            "chicago"        to Pair(41.9,  -87.6),
            "houston"        to Pair(29.8,  -95.4),
            "miami"          to Pair(25.8,  -80.2),
            "toronto"        to Pair(43.7,  -79.4),
            "montreal"       to Pair(45.5,  -73.6),
            "vancouver"      to Pair(49.3,  -123.1),
            "mexico city"    to Pair(19.4,  -99.1),
            "bogota"         to Pair(4.7,   -74.1),
            "lima"           to Pair(-12.1, -77.0),
            "santiago"       to Pair(-33.5, -70.7),
            "buenos aires"   to Pair(-34.6, -58.4),
            "sao paulo"      to Pair(-23.5, -46.6),
            "rio de janeiro" to Pair(-22.9, -43.2),
            // Oceania
            "sydney"         to Pair(-33.9,  151.2),
            "melbourne"      to Pair(-37.8,  145.0),
            "auckland"       to Pair(-36.9,  174.8)
        )
    }
}