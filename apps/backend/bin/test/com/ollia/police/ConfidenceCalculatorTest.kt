package com.ollia.saiae.police

import com.ollia.entity.ConfidenceTier
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Locks the SAIAE confidence model to the spec table. Each source profile mirrors a
 * row of saiae_source_registry (V24/V29). If a registry weight changes, the expected
 * numbers here must be re-derived deliberately — that is the point of the test.
 */
class ConfidenceCalculatorTest {

    private val usgs     = SourceProfile("usgs",     tier = 1, baseWeight = 38, isInstrument = true,  isAuthoritative = true,  soloFloor = 88)
    private val gov      = SourceProfile("government",tier = 1, baseWeight = 38, isInstrument = false, isAuthoritative = true,  soloFloor = 64)
    private val police   = SourceProfile("police",   tier = 2, baseWeight = 26, isInstrument = false, isAuthoritative = true,  soloFloor = 61)
    private val reuters  = SourceProfile("reuters",  tier = 1, baseWeight = 32, isInstrument = false, isAuthoritative = false, soloFloor = null)
    private val ap       = SourceProfile("ap",       tier = 1, baseWeight = 32, isInstrument = false, isAuthoritative = false, soloFloor = null)
    private val gdelt    = SourceProfile("gdelt",    tier = 1, baseWeight = 28, isInstrument = false, isAuthoritative = false, soloFloor = null)
    private val newsdata = SourceProfile("newsdata", tier = 2, baseWeight = 20, isInstrument = false, isAuthoritative = false, soloFloor = null)

    // ── Locked single-source rows ────────────────────────────────────────────
    @Test fun `government alone scores 64 and surfaces`() {
        val o = ConfidenceCalculator.score(listOf(gov))
        assertEquals(64, o.score)
        assertEquals(ConfidenceTier.MODERATE, o.tier)
        assertTrue(o.minimumSourcesMet)
    }

    @Test fun `police alone scores 61 and surfaces`() {
        val o = ConfidenceCalculator.score(listOf(police))
        assertEquals(61, o.score)
        assertTrue(o.minimumSourcesMet)
    }

    @Test fun `usgs alone scores 88 HIGH and surfaces`() {
        val o = ConfidenceCalculator.score(listOf(usgs))
        assertEquals(88, o.score)
        assertEquals(ConfidenceTier.HIGH, o.tier)
        assertTrue(o.minimumSourcesMet)
    }

    // ── Locked multi-source rows ─────────────────────────────────────────────
    @Test fun `gov plus reuters scores about 82`() {
        val o = ConfidenceCalculator.score(listOf(gov, reuters))
        assertEquals(82, o.score)
        assertEquals(ConfidenceTier.HIGH, o.tier)
        assertTrue(o.minimumSourcesMet)
    }

    @Test fun `gov plus reuters plus police scores about 90`() {
        val o = ConfidenceCalculator.score(listOf(gov, reuters, police))
        assertEquals(90, o.score)
        assertEquals(ConfidenceTier.HIGH, o.tier)
        assertEquals(3, o.independentOrigins)
    }

    // ── Echo chain — a single news source never surfaces ─────────────────────
    @Test fun `reuters alone is low and does NOT meet the source gate`() {
        val o = ConfidenceCalculator.score(listOf(reuters))
        assertEquals(45, o.score)
        assertEquals(ConfidenceTier.LOW, o.tier)
        assertFalse(o.minimumSourcesMet) // single non-authoritative news source → REJECTED
    }

    // ── Conflicts ────────────────────────────────────────────────────────────
    @Test fun `existence conflict subtracts 25`() {
        val o = ConfidenceCalculator.score(listOf(gov, reuters), existenceConflict = true)
        assertEquals(57, o.score) // 82 - 25
    }

    @Test fun `existence conflict caps confidence at 65`() {
        // usgs + reuters would be 95; existence drops 25 -> 70, capped to 65.
        val o = ConfidenceCalculator.score(listOf(usgs, reuters), existenceConflict = true)
        assertEquals(65, o.score)
    }

    @Test fun `detail conflict subtracts 6 with no cap`() {
        val o = ConfidenceCalculator.score(listOf(gov, reuters), detailConflict = true)
        assertEquals(76, o.score) // 82 - 6
    }

    // ── Hard ceiling ─────────────────────────────────────────────────────────
    @Test fun `confidence never exceeds 95`() {
        val o = ConfidenceCalculator.score(listOf(usgs, reuters)) // 88 + 17.9 = 105.9
        assertEquals(95, o.score)
    }

    // ── Corroboration of independent non-authoritative sources ───────────────
    @Test fun `two aggregators corroborate to moderate`() {
        val o = ConfidenceCalculator.score(listOf(gdelt, newsdata))
        assertEquals(52, o.score) // 41 + 20*0.56
        assertEquals(ConfidenceTier.MODERATE, o.tier)
        assertTrue(o.minimumSourcesMet)
    }

    @Test fun `two independent newswires corroborate to moderate`() {
        val o = ConfidenceCalculator.score(listOf(reuters, ap))
        assertEquals(63, o.score) // 45 + 32*0.56
        assertTrue(o.minimumSourcesMet)
    }

    // ── Degenerate input ─────────────────────────────────────────────────────
    @Test fun `no origins is blocked`() {
        val o = ConfidenceCalculator.score(emptyList())
        assertEquals(0, o.score)
        assertEquals(ConfidenceTier.BLOCKED, o.tier)
        assertFalse(o.minimumSourcesMet)
    }
}