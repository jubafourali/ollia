package com.ollia.saiae.police

import com.ollia.entity.ConfidenceTier
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Trust profile of a single source, projected from `saiae_source_registry`.
 * Pure data — no JPA — so the scoring model can be unit-tested without a DB.
 */
data class SourceProfile(
    val id: String,
    val tier: Int,
    val baseWeight: Int,
    val isInstrument: Boolean,
    val isAuthoritative: Boolean,
    val soloFloor: Int?,
)

data class ConfidenceOutcome(
    val score: Int,
    val tier: ConfidenceTier,
    val independentOrigins: Int,
    val minimumSourcesMet: Boolean,
)

/**
 * The SAIAE confidence model — a pure function calibrated to the locked spec table.
 *
 * Shape: a single **anchor** (the strongest source's standalone confidence) plus
 * **diminishing corroboration** from each additional *independent* source. The caller
 * must hand us only independent origins — i.e. de-duplicated by source (an "echo chain"
 * of N Reuters articles is ONE Reuters origin) and with republishers removed (BBC
 * citing Reuters is not independent of Reuters).
 *
 * Calibration (verified by ConfidenceCalculatorTest against every row):
 *   soloConfidence = soloFloor ?: (baseWeight + ANCHOR_OFFSET)
 *     usgs/noaa/gdacs → 88 (floor), government → 64, police → 61,
 *     reuters/ap → 45, gdelt → 41, bbc/newsdata → 33, local_media → 25
 *   corroboration(i) = baseWeight · CORROB_LEAD · CORROB_DECAY^i   (i = 0 for the first corroborator)
 *
 *   Gov alone                → 64
 *   Police alone             → 61
 *   USGS alone               → 88
 *   Gov + Reuters            → 64 + 32·0.56          = 81.9  → 82
 *   Gov + Reuters + Police   → 64 + 32·0.56 + 26·0.56·0.55 = 89.9 → 90
 *   Reuters only (echo)      → 45 (LOW) but fails the 2-source gate → REJECTED
 *   + existence conflict     → −25, capped at 65
 *   + detail conflict        → −6, no cap
 *   Hard ceiling             → 95
 */
object ConfidenceCalculator {

    const val ANCHOR_OFFSET   = 13       // news sources with no soloFloor: baseWeight + this
    const val CORROB_LEAD     = 0.56     // first corroborator strength
    const val CORROB_DECAY    = 0.55     // each further corroborator decays geometrically
    const val HARD_CEILING    = 95
    const val EXISTENCE_PENALTY = 25
    const val EXISTENCE_CAP   = 65
    const val DETAIL_PENALTY  = 6

    const val TIER_HIGH     = 75
    const val TIER_MODERATE = 50
    const val TIER_LOW      = 40

    fun soloConfidence(s: SourceProfile): Int = s.soloFloor ?: (s.baseWeight + ANCHOR_OFFSET)

    /**
     * @param origins independent origins only (deduped by source, republishers excluded)
     */
    fun score(
        origins: List<SourceProfile>,
        existenceConflict: Boolean = false,
        detailConflict: Boolean = false,
    ): ConfidenceOutcome {
        if (origins.isEmpty()) {
            return ConfidenceOutcome(0, ConfidenceTier.BLOCKED, 0, false)
        }

        // Anchor = the source with the strongest standalone confidence.
        val anchor = origins.maxWith(
            compareBy({ soloConfidence(it) }, { -it.tier }, { it.baseWeight })
        )
        // Corroborators ranked by raw evidentiary weight (tier first, then base weight).
        val corroborators = origins.filter { it !== anchor }
            .sortedWith(compareBy({ it.tier }, { -it.baseWeight }))

        var raw = soloConfidence(anchor).toDouble()
        corroborators.forEachIndexed { i, src ->
            raw += src.baseWeight * CORROB_LEAD * CORROB_DECAY.pow(i)
        }

        // Conflicts: existence is a hard penalty with a confidence cap; detail is a light nudge.
        if (existenceConflict) raw = minOf(EXISTENCE_CAP.toDouble(), raw - EXISTENCE_PENALTY)
        if (detailConflict)    raw -= DETAIL_PENALTY

        val score = raw.roundToInt().coerceIn(0, HARD_CEILING)

        val tier = when {
            score >= TIER_HIGH     -> ConfidenceTier.HIGH
            score >= TIER_MODERATE -> ConfidenceTier.MODERATE
            score >= TIER_LOW      -> ConfidenceTier.LOW
            else                   -> ConfidenceTier.BLOCKED
        }

        // ── The "minimum 2 trusted confirmations" gate ───────────────────────────
        // Instruments (USGS/NOAA/GDACS) are self-sufficient. A single authoritative
        // source (government/police) is allowed. Everything else — news/aggregators —
        // needs ≥2 independent origins, at least one of tier ≤ 2.
        val hasInstrument     = origins.any { it.isInstrument }
        val authoritativeSolo = origins.size == 1 && origins[0].isAuthoritative
        val multiSource       = origins.size >= 2 && origins.any { it.tier <= 2 }
        val passesGate        = hasInstrument || authoritativeSolo || multiSource

        return ConfidenceOutcome(
            score              = score,
            tier               = tier,
            independentOrigins = origins.size,
            minimumSourcesMet  = passesGate && tier != ConfidenceTier.BLOCKED,
        )
    }
}