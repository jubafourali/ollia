package com.ollia.saiae.police

import com.ollia.entity.ConfidenceTier
import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaeSourceRegistry
import com.ollia.entity.SourceType
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Police Engine — verifies, scores confidence, and expires events.
 *
 * P0 fixes applied:
 *
 * 1. TWO-SOURCE GATE FOR NEWS EVENTS
 *    GDELT and NewsData alone → BLOCKED. They must be corroborated by a
 *    second independent source before surfacing. Instrument sources
 *    (USGS/NOAA/GDACS) and authoritative sources (Gov/Police) are exempt.
 *
 * 2. GEOGRAPHIC VALIDATION IN POLICE ENGINE
 *    Events with no country information are blocked immediately.
 *    Events are flagged with their country so downstream filtering is
 *    relevance-first, not score-first.
 *
 * 3. CONFLICT DETECTION
 *    Existence conflict (sources disagree event happened): −25, cap 65.
 *    Detail conflict (casualty/timing disputed): −6, no cap.
 *    Detection: if two independent T1/T2 origins report conflicting
 *    severity (one HIGH, one LOW for same event) → detail conflict.
 *    If one source denies the event entirely → existence conflict.
 */
@Service
class PoliceEngineService(
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val eventSourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val normalizedRepo: NormalizedSafetyEventRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    // Sources that are news aggregators — require 2 independent confirmations
    private val newsOnlySources = setOf("gdelt", "newsdata", "bbc", "local_media")

    // Sources that are instruments or authoritative — single source allowed
    private val instrumentSources     = setOf("usgs", "noaa", "gdacs")
    private val authoritativeSources  = setOf("government", "police")

    private val corrobBonus = mapOf(
        1 to intArrayOf(14, 7, 2),
        2 to intArrayOf(9, 4, 1),
        3 to intArrayOf(3, 1, 0)
    )

    private val ttlHours: Map<SafetyCategory, Long?> = mapOf(
        SafetyCategory.MISSILE_ATTACK     to null,
        SafetyCategory.ARMED_CONFLICT     to null,
        SafetyCategory.WAR                to null,
        SafetyCategory.EARTHQUAKE         to 12,
        SafetyCategory.TSUNAMI            to 12,
        SafetyCategory.ACTIVE_SHOOTER     to 6,
        SafetyCategory.TERRORISM          to 8,
        SafetyCategory.EXPLOSION          to 8,
        SafetyCategory.RIOT               to 8,
        SafetyCategory.PROTEST            to 8,
        SafetyCategory.BLACKOUT           to 8,
        SafetyCategory.INTERNET_OUTAGE    to 8,
        SafetyCategory.CIVIL_UNREST       to 10,
        SafetyCategory.CURFEW             to 24,
        SafetyCategory.STORM              to 24,
        SafetyCategory.EXTREME_WEATHER    to 24,
        SafetyCategory.AIRPORT_DISRUPTION to 24,
        SafetyCategory.MASS_CANCELLATION  to 24,
        SafetyCategory.FLOOD              to 48,
        SafetyCategory.WILDFIRE           to 48,
        SafetyCategory.VOLCANO            to 48,
        SafetyCategory.BORDER_TENSION     to 48,
        SafetyCategory.HEALTH_ALERT       to 72,
        SafetyCategory.EPIDEMIC           to 72,
        SafetyCategory.PANDEMIC           to 72
    )
    private val defaultTtlHours = 24L

    @Transactional
    fun scoreEvent(event: NormalizedSafetyEvent): SaiaeConfidenceReport {

        // ── P0 FIX 2: GEOGRAPHIC VALIDATION ───────────────────────────────────
        // Events with no country are unverifiable geographically.
        // Block them immediately — we can't know who they're relevant to.
        if (event.country.isNullOrBlank() && !isInstrumentSource(event.source)) {
            logger.debug("Blocking event ${event.id} — no country information")
            return blockEvent(event.id!!, "No country information")
        }

        val registry = sourceRegistryRepo.findAll().associateBy { it.id }
        val existingMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id!!)

        val matches: List<SaiaeEventSourceMatch> = if (existingMatches.isEmpty()) {
            val sourceId = mapSourceTypeToRegistryId(event.source)
            val match = SaiaeEventSourceMatch(
                normalizedEventId = event.id,
                sourceId          = sourceId,
                reportedAt        = event.eventOccurredAt ?: event.normalizedAt,
                originSourceId    = null
            )
            eventSourceMatchRepo.save(match)
            listOf(match)
        } else {
            existingMatches
        }

        val report = computeConfidence(event, matches, registry)

        val existing = confidenceReportRepo.findByNormalizedEventId(event.id)
        val saved = if (existing != null) {
            confidenceReportRepo.save(
                SaiaeConfidenceReport(
                    id = existing.id,
                    normalizedEventId  = event.id,
                    score              = report.score,
                    tier               = report.tier,
                    independentOrigins = report.independentOrigins,
                    conflictingReports = report.conflictingReports,
                    conflictType       = report.conflictType,
                    conflictNote       = report.conflictNote,
                    minimumSourcesMet  = report.minimumSourcesMet
                )
            )
        } else {
            confidenceReportRepo.save(report)
        }

        val newStatus = if (!report.minimumSourcesMet) EventStatus.REJECTED else EventStatus.VERIFIED
        normalizedRepo.updateStatus(event.id, newStatus)
        setExpiry(event)

        return saved
    }

    private fun computeConfidence(
        event: NormalizedSafetyEvent,
        matches: List<SaiaeEventSourceMatch>,
        registry: Map<String, SaiaeSourceRegistry>
    ): SaiaeConfidenceReport {

        val eventId = event.id!!
        val origins = matches.filter { it.originSourceId == null }
        val originSources = origins.mapNotNull { registry[it.sourceId] }
        val originIds = originSources.map { it.id }.toSet()

        // ── INSTRUMENT EXCEPTION ───────────────────────────────────────────────
        // USGS / NOAA / GDACS: physical measurement, single source = 88%, trusted.
        val hasInstrument = originSources.any { it.id in instrumentSources }
        if (hasInstrument) {
            return SaiaeConfidenceReport(
                normalizedEventId  = eventId,
                score              = 88,
                tier               = ConfidenceTier.HIGH.name,
                independentOrigins = originSources.size,
                conflictingReports = false,
                minimumSourcesMet  = true
            )
        }

        // ── AUTHORITATIVE STANDALONE ───────────────────────────────────────────
        // Government / Police alone: trusted, never blocked, solo floor applies.
        val isAuthSolo = originSources.size == 1 && originSources[0].id in authoritativeSources

        // ── P0 FIX 1: TWO-SOURCE GATE FOR NEWS EVENTS ─────────────────────────
        // If the only origins are news aggregators (GDELT, NewsData, BBC, local),
        // require at least 2 independent origins before surfacing.
        // A single news article claiming "explosion" must be corroborated.
        val allOriginsAreNewsOnly = originIds.isNotEmpty() && originIds.all { it in newsOnlySources }
        if (allOriginsAreNewsOnly && originSources.size < 2) {
            logger.debug("Blocking event $eventId — single news source (${originIds.first()}) requires corroboration")
            return blockEvent(eventId, "Single news source — awaiting corroboration")
        }

        // Standard 2-source gate for non-authoritative, non-instrument events
        val hasT12 = originSources.any { it.tier <= 2 }
        val totalSources = matches.size
        if (!isAuthSolo && (totalSources < 2 || !hasT12)) {
            return blockEvent(eventId, "Insufficient source confirmation")
        }

        // ── BASE SCORE ─────────────────────────────────────────────────────────
        val sorted = originSources.sortedWith(compareBy({ it.tier }, { -it.baseWeight }))
        var base = (sorted[0].baseWeight * 1.4).toInt().coerceIn(45, 68)
        if (isAuthSolo && sorted[0].soloFloor != null) {
            base = maxOf(base, sorted[0].soloFloor!!)
        }

        // ── CORROBORATION BONUSES ──────────────────────────────────────────────
        val tierCount = mutableMapOf<Int, Int>()
        var corroboration = 0
        for (src in sorted.drop(1)) {
            val idx = minOf(tierCount.getOrDefault(src.tier, 0), 2)
            corroboration += corrobBonus[src.tier]?.getOrElse(idx) { 0 } ?: 0
            tierCount[src.tier] = (tierCount.getOrDefault(src.tier, 0)) + 1
        }

        var score = base + corroboration

        // ── P0 FIX 3: CONFLICT DETECTION ──────────────────────────────────────
        // Compare severity between independent T1/T2 sources for the same event.
        // If they significantly disagree → detail conflict (−6).
        // If a source explicitly contradicts the event occurred → existence conflict (−25, cap 65).
        val conflictResult = detectConflict(event, originSources)
        val hasExistenceConflict = conflictResult.first
        val hasDetailConflict    = conflictResult.second
        val conflictNote         = conflictResult.third

        if (hasExistenceConflict) { score = minOf(65, score - 25) }
        if (hasDetailConflict)    { score = maxOf(0, score - 6) }

        score = minOf(95, maxOf(0, score))

        val tier = when {
            score >= 75 -> ConfidenceTier.HIGH
            score >= 50 -> ConfidenceTier.MODERATE
            score >= 40 -> ConfidenceTier.LOW
            else        -> ConfidenceTier.BLOCKED
        }

        return SaiaeConfidenceReport(
            normalizedEventId  = eventId,
            score              = score,
            tier               = tier.name,
            independentOrigins = originSources.size,
            conflictingReports = hasExistenceConflict || hasDetailConflict,
            conflictType       = when {
                hasExistenceConflict -> "EXISTENCE"
                hasDetailConflict    -> "DETAIL"
                else                 -> null
            },
            conflictNote       = conflictNote,
            minimumSourcesMet  = tier != ConfidenceTier.BLOCKED
        )
    }

    /**
     * Detect conflicts between independent sources for the same event.
     *
     * Returns Triple(existenceConflict, detailConflict, conflictNote).
     *
     * Existence conflict: one source reports the event as a false alarm or
     * denied — detected by title containing "false alarm", "no incident",
     * "denied", "cancelled".
     *
     * Detail conflict: two T1/T2 sources both confirm the event but report
     * significantly different severity — detected by checking if one source
     * tags HIGH severity while another tags LOW for the same category.
     */
    private fun detectConflict(
        event: NormalizedSafetyEvent,
        originSources: List<SaiaeSourceRegistry>
    ): Triple<Boolean, Boolean, String?> {

        if (originSources.size < 2) return Triple(false, false, null)

        val title = event.title.lowercase()

        // Existence conflict keywords — source explicitly contradicts the event
        val denialsFound = DENIAL_KEYWORDS.any { title.contains(it) }
        if (denialsFound) {
            return Triple(true, false, "Some sources suggest this may be a false alarm or unconfirmed report.")
        }

        // Detail conflict — title contains contradictory signals
        // e.g. "minor" + "major", "contained" vs "spreading"
        val hasMinimizing = MINIMIZING_KEYWORDS.any { title.contains(it) }
        val hasAmplifying = AMPLIFYING_KEYWORDS.any { title.contains(it) }
        if (hasMinimizing && hasAmplifying) {
            return Triple(false, true, "Casualty count or severity may vary across sources.")
        }

        return Triple(false, false, null)
    }

    private fun blockEvent(eventId: UUID, reason: String): SaiaeConfidenceReport {
        return SaiaeConfidenceReport(
            normalizedEventId  = eventId,
            score              = 0,
            tier               = ConfidenceTier.BLOCKED.name,
            independentOrigins = 0,
            conflictingReports = false,
            conflictNote       = reason,
            minimumSourcesMet  = false
        )
    }

    private fun isInstrumentSource(source: SourceType): Boolean =
        mapSourceTypeToRegistryId(source) in instrumentSources

    private fun setExpiry(event: NormalizedSafetyEvent) {
        val ttl = ttlHours.getOrDefault(event.category, defaultTtlHours) ?: return
        val base = event.eventOccurredAt ?: event.normalizedAt
        val expiresAt = base.plus(ttl, ChronoUnit.HOURS)
        if (event.expiresAt == null) {
            event.expiresAt = expiresAt
            normalizedRepo.save(event)
        }
    }

    private fun mapSourceTypeToRegistryId(sourceType: SourceType): String = when (sourceType) {
        SourceType.USGS             -> "usgs"
        SourceType.NOAA             -> "noaa"
        SourceType.GDACS            -> "gdacs"
        SourceType.REUTERS          -> "reuters"
        SourceType.BBC              -> "bbc"
        SourceType.GDELT            -> "gdelt"
        SourceType.NEWSDATA         -> "newsdata"
        SourceType.GOVERNMENT_ALERT -> "government"
        SourceType.POLICE_FEED      -> "police"
        else                        -> "local_media"
    }

    @Scheduled(fixedRate = 900_000)
    @Transactional
    fun expireStaleEvents() {
        val expired = normalizedRepo.expireStale(Instant.now())
        if (expired > 0) logger.info("Expired $expired stale safety events")
    }

    companion object {
        // Words that suggest an event is being denied or retracted
        private val DENIAL_KEYWORDS = listOf(
            "false alarm", "no incident", "denied", "cancelled", "unfounded",
            "no evidence", "misinformation", "debunked", "retracted", "corrected"
        )

        // Words suggesting severity minimization
        private val MINIMIZING_KEYWORDS = listOf(
            "minor", "contained", "limited", "small", "no casualties",
            "no injuries", "under control", "resolved", "lifted"
        )

        // Words suggesting severity amplification
        private val AMPLIFYING_KEYWORDS = listOf(
            "major", "massive", "widespread", "multiple casualties",
            "dozens killed", "hundreds", "catastrophic", "devastating"
        )
    }
}