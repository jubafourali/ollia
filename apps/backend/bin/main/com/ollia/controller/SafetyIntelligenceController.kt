package com.ollia.controller

import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.saiae.repository.SaiaeCircleAlertCacheRepository
import com.ollia.saiae.repository.SaiaeConfidenceReportRepository
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.service.CurrentUserService
import com.fasterxml.jackson.databind.JsonNode
import com.ollia.entity.EventStatus
import com.ollia.entity.SaiaeCircleAlertCache
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

/**
 * SAIAE public API.
 *
 * GET /api/v2/alerts
 *   Returns alert cards for all circle members the current user can see.
 *   Sorted by effectiveRisk (IMPORTANT first) then renderedAt desc.
 *   Returns 200 with empty array when no alerts — never 404.
 *
 * GET /api/v2/alerts/{eventId}
 *   Full detail for a single event including source chain.
 */
@RestController
@RequestMapping("/api/v2/alerts")
class SafetyIntelligenceController(
    private val currentUserService: CurrentUserService,
    private val familyMemberRepository: FamilyMemberRepository,
    private val alertCacheRepo: SaiaeCircleAlertCacheRepository,
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val sourceMatchRepo: SaiaeEventSourceMatchRepository
) {

    @GetMapping
    fun getAlerts(): ResponseEntity<List<AlertCardResponse>> {
        val user = currentUserService.getCurrentUser()

        // Cards are cached per observer (the person who should see them), not per
        // watched member. Load the current user's feed only.
        val circleIds = familyMemberRepository
            .findAllByUserId(user.id!!)
            .map { it.circleId }
            .distinct()

        if (circleIds.isEmpty()) return ResponseEntity.ok(emptyList())

        val hasPeers = familyMemberRepository
            .findAllByCircleIdIn(circleIds)
            .any { it.userId != user.id }

        if (!hasPeers) return ResponseEntity.ok(emptyList())

        val cards = alertCacheRepo.findAllByUserId(user.id!!)

        // Batch-load the referenced events once, then keep only VERIFIED ones
        // (no per-card findById — that was an N+1 over the whole feed).
        val verifiedEventIds = normalizedRepo
            .findAllById(cards.map { it.normalizedEventId }.distinct())
            .filter { it.status == EventStatus.VERIFIED }
            .mapNotNull { it.id }
            .toSet()

        val response = cards
            .filter { it.normalizedEventId in verifiedEventIds }
            .sortedWith(
                compareByDescending<SaiaeCircleAlertCache> { riskOrdinal(it.effectiveRisk) }
                    .thenByDescending { it.renderedAt }
            )
            .map { it.toResponse() }

        return ResponseEntity.ok(response)
    }

    @GetMapping("/{eventId}")
    fun getAlert(@PathVariable eventId: UUID): ResponseEntity<AlertDetailResponse> {
        val user = currentUserService.getCurrentUser()

        val event = normalizedRepo.findById(eventId).orElse(null)
            ?: return ResponseEntity.notFound().build()

        val cache = alertCacheRepo.findByNormalizedEventIdAndUserId(eventId, user.id!!)
            ?: return ResponseEntity.notFound().build()

        val confidence = confidenceReportRepo.findByNormalizedEventId(eventId)
        val sourceMatches = sourceMatchRepo.findAllByNormalizedEventId(eventId)

        return ResponseEntity.ok(
            AlertDetailResponse(
                eventId       = eventId,
                effectiveRisk = cache.effectiveRisk,
                floorApplied  = cache.floorApplied,
                cardPayload   = cache.cardPayload,
                confidenceScore = confidence?.score,
                confidenceTier  = confidence?.tier,
                sources = sourceMatches.map { match ->
                    SourceMatchResponse(
                        sourceId     = match.sourceId,
                        reportedAt   = match.reportedAt.toString(),
                        originSource = match.originSourceId
                    )
                },
                renderedAt = cache.renderedAt.toString()
            )
        )
    }

    private fun riskOrdinal(level: String) = when (level) {
        "IMPORTANT_DISRUPTION" -> 2; "STAY_AWARE" -> 1; else -> 0
    }

    private fun SaiaeCircleAlertCache.toResponse() = AlertCardResponse(
        eventId       = normalizedEventId,
        effectiveRisk = effectiveRisk,
        floorApplied  = floorApplied,
        card          = cardPayload,
        renderedAt    = renderedAt.toString()
    )
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

data class AlertCardResponse(
    val eventId:       UUID,
    val effectiveRisk: String,
    val floorApplied:  Boolean,
    val card:          JsonNode,
    val renderedAt:    String
)

data class AlertDetailResponse(
    val eventId:         UUID,
    val effectiveRisk:   String,
    val floorApplied:    Boolean,
    val cardPayload:     JsonNode,
    val confidenceScore: Int?,
    val confidenceTier:  String?,
    val sources:         List<SourceMatchResponse>,
    val renderedAt:      String
)

data class SourceMatchResponse(
    val sourceId:     String,
    val reportedAt:   String,
    val originSource: String?   // null = original report, set = echo chain
)