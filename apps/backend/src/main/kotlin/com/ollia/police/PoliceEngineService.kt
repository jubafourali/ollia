package com.ollia.saiae.police

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
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Police Engine — verifies, scores confidence, and expires events.
 *
 * Confidence scoring rules (locked spec):
 *  - Instrument (USGS/NOAA/GDACS): score = 88, bypass all else
 *  - Authoritative standalone: soloFloor from registry, never blocked
 *  - All others: need 2+ sources with ≥1 T1/T2 independent origin
 *    base = topWeight × 1.4 clamped 45–68
 *    corroboration bonuses with diminishing returns per tier
 *    conflict penalties: EXISTENCE −25 cap 65, DETAIL −6
 *    hard cap: 95
 *
 * Tiers: HIGH 75-95 | MODERATE 50-74 | LOW 40-49 | BLOCKED 0-39
 */
@Service
class PoliceEngineService(
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val eventSourceMatchRepo: SaiaeEventSourceMatchRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val normalizedRepo: NormalizedSafetyEventRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    // Corroboration bonus table: tier → [2nd, 3rd, 4th+]
    private val corrobBonus = mapOf(
        1 to intArrayOf(14, 7, 2),
        2 to intArrayOf(9, 4, 1),
        3 to intArrayOf(3, 1, 0)
    )

    // TTL map: category → hours (null = no expiry)
    private val ttlHours: Map<SafetyCategory, Long?> = mapOf(
        SafetyCategory.MISSILE_ATTACK  to null,
        SafetyCategory.ARMED_CONFLICT  to null,
        SafetyCategory.WAR             to null,
        SafetyCategory.EARTHQUAKE      to 12,
        SafetyCategory.TSUNAMI         to 12,
        SafetyCategory.ACTIVE_SHOOTER  to 6,
        SafetyCategory.TERRORISM       to 8,
        SafetyCategory.EXPLOSION       to 8,
        SafetyCategory.RIOT            to 8,
        SafetyCategory.PROTEST         to 8,
        SafetyCategory.BLACKOUT        to 8,
        SafetyCategory.INTERNET_OUTAGE to 8,
        SafetyCategory.CIVIL_UNREST    to 10,
        SafetyCategory.CURFEW          to 24,
        SafetyCategory.STORM           to 24,
        SafetyCategory.EXTREME_WEATHER to 24,
        SafetyCategory.AIRPORT_DISRUPTION to 24,
        SafetyCategory.MASS_CANCELLATION  to 24,
        SafetyCategory.FLOOD           to 48,
        SafetyCategory.WILDFIRE        to 48,
        SafetyCategory.VOLCANO         to 48,
        SafetyCategory.BORDER_TENSION  to 48,
        SafetyCategory.HEALTH_ALERT    to 72,
        SafetyCategory.EPIDEMIC        to 72,
        SafetyCategory.PANDEMIC        to 72
    )
    private val defaultTtlHours = 24L

    /**
     * Score a single event. Called from SaiaeOrchestrator.
     * For instrument sources (USGS/NOAA/GDACS), no source matches are needed —
     * the source itself is the single authoritative origin.
     */
    @Transactional
    fun scoreEvent(event: NormalizedSafetyEvent): SaiaeConfidenceReport {
        val registry = sourceRegistryRepo.findAll().associateBy { it.id }
        val existingMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id!!)

        // Seed instrument source match if none exist yet
        val matches: List<SaiaeEventSourceMatch> = if (existingMatches.isEmpty()) {
            val sourceId = mapSourceTypeToRegistryId(event.source)
            val match = SaiaeEventSourceMatch(
                normalizedEventId = event.id,
                sourceId = sourceId,
                reportedAt = event.eventOccurredAt ?: event.normalizedAt,
                originSourceId = null
            )
            eventSourceMatchRepo.save(match)
            listOf(match)
        } else {
            existingMatches
        }

        val report = computeConfidence(event.id, matches, registry)

        // Persist or update
        val existing = confidenceReportRepo.findByNormalizedEventId(event.id)
        val saved = if (existing != null) {
            confidenceReportRepo.save(
                SaiaeConfidenceReport(
                    id = existing.id,
                    normalizedEventId = event.id,
                    score = report.score,
                    tier = report.tier,
                    independentOrigins = report.independentOrigins,
                    conflictingReports = report.conflictingReports,
                    conflictType = report.conflictType,
                    conflictNote = report.conflictNote,
                    minimumSourcesMet = report.minimumSourcesMet
                )
            )
        } else {
            confidenceReportRepo.save(report)
        }

        // Update event status based on score
        val newStatus = when {
            !report.minimumSourcesMet -> EventStatus.REJECTED
            else -> EventStatus.VERIFIED
        }
        normalizedRepo.updateStatus(event.id, newStatus)

        // Set expiry timestamp
        setExpiry(event)

        return saved
    }

    private fun computeConfidence(
        eventId: UUID,
        matches: List<SaiaeEventSourceMatch>,
        registry: Map<String, SaiaeSourceRegistry>
    ): SaiaeConfidenceReport {

        val origins = matches.filter { it.originSourceId == null }
        val originSources = origins.mapNotNull { registry[it.sourceId] }

        // Instrument exception
        val hasInstrument = originSources.any { it.isInstrument }
        if (hasInstrument && originSources.size == 1) {
            return SaiaeConfidenceReport(
                normalizedEventId   = eventId,
                score               = 88,
                tier                = ConfidenceTier.HIGH.name,
                independentOrigins  = 1,
                conflictingReports  = false,
                minimumSourcesMet   = true
            )
        }

        // Authoritative standalone
        val isAuthSolo = originSources.size == 1 && originSources[0].isAuthoritative
        val hasT12 = originSources.any { it.tier <= 2 }
        val totalSources = matches.size

        if (!isAuthSolo && (totalSources < 2 || !hasT12)) {
            return SaiaeConfidenceReport(
                normalizedEventId  = eventId,
                score              = 0,
                tier               = ConfidenceTier.BLOCKED.name,
                independentOrigins = originSources.size,
                minimumSourcesMet  = false
            )
        }

        // Base score
        val sorted = originSources.sortedWith(compareBy({ it.tier }, { -it.baseWeight }))
        var base = (sorted[0].baseWeight * 1.4).toInt().coerceIn(45, 68)
        if (isAuthSolo && sorted[0].soloFloor != null) {
            base = maxOf(base, sorted[0].soloFloor!!)
        }

        // Corroboration bonuses
        val tierCount = mutableMapOf<Int, Int>()
        var corroboration = 0
        for (src in sorted.drop(1)) {
            val idx = minOf(tierCount.getOrDefault(src.tier, 0), 2)
            corroboration += corrobBonus[src.tier]?.getOrElse(idx) { 0 } ?: 0
            tierCount[src.tier] = (tierCount.getOrDefault(src.tier, 0)) + 1
        }

        var score = base + corroboration

        // Conflict penalties (extend later with actual conflict detection)
        val hasExistenceConflict = false // populated by external conflict signal
        val hasDetailConflict = false
        if (hasExistenceConflict) { score = minOf(65, score - 25) }
        if (hasDetailConflict)    { score = maxOf(0, score - 6) }

        // Hard cap
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
            minimumSourcesMet  = tier != ConfidenceTier.BLOCKED
        )
    }

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
        SourceType.GOVERNMENT_ALERT -> "government"
        SourceType.POLICE_FEED      -> "police"
        else                        -> "local_media"
    }

    /** Runs every 15 min — expires stale events. */
    @Scheduled(fixedRate = 900_000)
    @Transactional
    fun expireStaleEvents() {
        val expired = normalizedRepo.expireStale(Instant.now())
        if (expired > 0) logger.info("Expired $expired stale safety events")
    }
}
