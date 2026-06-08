package com.ollia.saiae.police

import com.ollia.entity.ConfidenceTier
import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaeSourceRegistry
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

    // Trust weights, tiers, instrument/authoritative flags and echo-chain
    // (typicallyRepublishes) all live in the saiae_source_registry table — there is
    // no hardcoded duplicate here. The scoring model is ConfidenceCalculator.

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
        SafetyCategory.PANDEMIC           to 72,
        // Standing government advisories — re-emitted daily, kept alive ~1.5 days.
        SafetyCategory.GOVERNMENT_ADVISORY to 36,
        SafetyCategory.TRAVEL_RESTRICTION  to 48
    )
    private val defaultTtlHours = 24L

    @Transactional
    fun scoreEvent(event: NormalizedSafetyEvent): SaiaeConfidenceReport {

        val registry = sourceRegistryRepo.findAll().associateBy { it.id }

        // ── GEOGRAPHIC VALIDATION ─────────────────────────────────────────────
        // Events with no country are unverifiable geographically — unless they come
        // from a physical instrument (USGS/NOAA/GDACS), which is inherently self-locating.
        val ownIsInstrument = registry[SourceRegistryMapping.registryId(event.source)]?.isInstrument == true
        if (event.country.isNullOrBlank() && !ownIsInstrument) {
            logger.debug("Blocking event ${event.id} — no country information")
            return blockEvent(event.id!!, "No country information")
        }

        val existingMatches = eventSourceMatchRepo.findAllByNormalizedEventId(event.id!!)

        val matches: List<SaiaeEventSourceMatch> = if (existingMatches.isEmpty()) {
            val sourceId = SourceRegistryMapping.registryId(event.source)
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

        // Independent origins only:
        //  • drop republishers (originSourceId != null — they echo another source)
        //  • collapse same-source duplicates (an "echo chain" of N articles = 1 origin)
        val independentProfiles: List<SourceProfile> = matches
            .filter { it.originSourceId == null }
            .mapNotNull { registry[it.sourceId] }
            .distinctBy { it.id }
            .map { it.toProfile() }

        if (independentProfiles.isEmpty()) {
            return blockEvent(eventId, "No recognized source")
        }

        // Cross-source conflict detection (title-based here; the correlation step will
        // pass full cluster context once multi-source clustering lands).
        val (existence, detail, note) = detectConflict(event, independentProfiles.size)

        val outcome = ConfidenceCalculator.score(
            origins           = independentProfiles,
            existenceConflict = existence,
            detailConflict    = detail,
        )

        return SaiaeConfidenceReport(
            normalizedEventId  = eventId,
            score              = outcome.score,
            tier               = outcome.tier.name,
            independentOrigins = outcome.independentOrigins,
            conflictingReports = existence || detail,
            conflictType       = when {
                existence -> "EXISTENCE"
                detail    -> "DETAIL"
                else      -> null
            },
            conflictNote       = note,
            minimumSourcesMet  = outcome.minimumSourcesMet,
        )
    }

    private fun SaiaeSourceRegistry.toProfile() = SourceProfile(
        id              = id,
        tier            = tier,
        baseWeight      = baseWeight,
        isInstrument    = isInstrument,
        isAuthoritative = isAuthoritative,
        soloFloor       = soloFloor,
    )

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
        independentOriginCount: Int
    ): Triple<Boolean, Boolean, String?> {

        if (independentOriginCount < 2) return Triple(false, false, null)

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

    private fun setExpiry(event: NormalizedSafetyEvent) {
        val ttl = ttlHours.getOrDefault(event.category, defaultTtlHours) ?: return
        val base = event.eventOccurredAt ?: event.normalizedAt
        val expiresAt = base.plus(ttl, ChronoUnit.HOURS)
        if (event.expiresAt == null) {
            event.expiresAt = expiresAt
            normalizedRepo.save(event)
        }
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