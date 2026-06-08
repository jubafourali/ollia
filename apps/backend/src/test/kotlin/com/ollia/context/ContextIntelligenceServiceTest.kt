package com.ollia.saiae.context

import com.ollia.entity.LocationRelevance
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RiskLevel
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.entity.User
import com.ollia.saiae.risk.RiskAssessment
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ContextIntelligenceServiceTest {

    private val now = Instant.parse("2026-06-07T12:00:00Z")
    private val service = ContextIntelligenceService(Clock.fixed(now, ZoneOffset.UTC))

    private fun event(
        category: SafetyCategory = SafetyCategory.EARTHQUAKE,
        country: String? = "Japan",
        city: String? = "Tokyo",
        occurredAt: Instant = now.minus(5, ChronoUnit.DAYS),  // deliberately stale
    ) = NormalizedSafetyEvent(
        rawSignalId = UUID.randomUUID(), source = SourceType.USGS, category = category,
        severity = Severity.HIGH, title = "headline", description = null,
        country = country, city = city, latitude = null, longitude = null, radiusKm = null,
        eventOccurredAt = occurredAt,
    )

    private fun conf(tier: String = "HIGH", score: Int = 88) = SaiaeConfidenceReport(
        normalizedEventId = UUID.randomUUID(), score = score, tier = tier,
        independentOrigins = 2, minimumSourcesMet = true,
    )

    private fun user(checkIn: Instant?) =
        User(clerkId = "c", name = "Camille", email = "c@x.com", lastCheckInAt = checkIn)

    private fun compute(
        event: NormalizedSafetyEvent = event(),
        risk: RiskLevel = RiskLevel.STAY_AWARE,
        conf: SaiaeConfidenceReport = conf(),
        user: User = user(now.minus(2, ChronoUnit.HOURS)),
        location: LocationRelevance = LocationRelevance.SAME_COUNTRY,
    ) = service.compute(
        memberName = "Camille", event = event,
        risk = RiskAssessment(risk, 50, false), confidence = conf, user = user,
        locationRelevance = location, distanceKm = 10.0,
    )

    // ── The core data-correctness fix ────────────────────────────────────────
    @Test fun `sentence uses the user's last check-in, not the event timestamp`() {
        // event occurred 5 days ago; Camille checked in 2 hours ago.
        val r = compute(user = user(now.minus(2, ChronoUnit.HOURS)))
        assertTrue(r.calmSentence.contains("checked in 2 hours ago"), r.calmSentence)
        assertFalse(r.calmSentence.contains("days ago"), r.calmSentence)
    }

    // ── Tone / grammar ───────────────────────────────────────────────────────
    @Test fun `high confidence reads cleanly with no doubled verb`() {
        val r = compute(conf = conf("HIGH"))
        assertFalse(r.calmSentence.contains("reports of"), r.calmSentence)
        assertFalse(r.calmSentence.lowercase().contains("reported has been reported"), r.calmSentence)
        assertTrue(r.calmSentence.contains("has been reported"), r.calmSentence)
    }

    @Test fun `active person gets reassurance`() {
        val r = compute(user = user(now.minus(30, ChronoUnit.MINUTES)))
        assertTrue(r.calmSentence.contains("appears unaffected"), r.calmSentence)
        assertTrue(r.calmSentence.contains("Nothing right now suggests"), r.calmSentence)
    }

    @Test fun `silent person never gets alarmist phrasing`() {
        val r = compute(user = user(now.minus(20, ChronoUnit.HOURS)))
        assertFalse(r.calmSentence.contains("No activity detected"), r.calmSentence)
        assertTrue(r.calmSentence.contains("Reaching out could help"), r.calmSentence)
    }

    @Test fun `low confidence is framed as unconfirmed`() {
        val r = compute(conf = conf("LOW", 45))
        assertTrue(r.calmSentence.contains("unconfirmed reports"), r.calmSentence)
    }

    // ── Strict push gating ───────────────────────────────────────────────────
    @Test fun `stay_aware does not push`() {
        assertFalse(compute(risk = RiskLevel.STAY_AWARE).pushEligible)
    }

    @Test fun `important disruption pushes`() {
        assertTrue(compute(risk = RiskLevel.IMPORTANT_DISRUPTION).pushEligible)
    }

    @Test fun `nearby war is floored to important and pushes`() {
        val r = compute(
            event = event(category = SafetyCategory.WAR),
            risk = RiskLevel.STAY_AWARE,
            location = LocationRelevance.SAME_COUNTRY,
        )
        assertTrue(r.floorApplied)
        assertTrue(r.pushEligible)
    }

    @Test fun `distant war is not floored and stays silent`() {
        val r = compute(
            event = event(category = SafetyCategory.WAR, country = "Ukraine"),
            risk = RiskLevel.STAY_AWARE,
            location = LocationRelevance.DISTANT,
        )
        assertFalse(r.floorApplied)
        assertFalse(r.pushEligible)
    }
}