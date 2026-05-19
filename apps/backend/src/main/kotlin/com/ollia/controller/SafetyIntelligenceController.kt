package com.ollia.saiae.controller

import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.UserRepository
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
    private val userRepository: UserRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val familyCircleRepository: FamilyCircleRepository,
    private val alertCacheRepo: SaiaeCircleAlertCacheRepository,
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val confidenceReportRepo: SaiaeConfidenceReportRepository,
    private val sourceMatchRepo: SaiaeEventSourceMatchRepository
) {

    @GetMapping
    fun getAlerts(): ResponseEntity<List<AlertCardResponse>> {
        val user = currentUserService.getCurrentUser()

        // Find all users in circles that this user is part of
        val circleIds = familyMemberRepository
            .findAllByUserId(user.id!!)
            .map { it.circleId }
            .distinct()

        if (circleIds.isEmpty()) return ResponseEntity.ok(emptyList())

        // All members in those circles (excluding self)
        val memberUserIds = familyMemberRepository
            .findAllByCircleIdIn(circleIds)
            .map { it.userId }
            .filter { it != user.id }
            .distinct()

        if (memberUserIds.isEmpty()) return ResponseEntity.ok(emptyList())

        // Load cached alert cards for those members
        val cards = alertCacheRepo
            .findAllByUserIdIn(memberUserIds)
            .filter { cache ->
                // Only surface VERIFIED events that aren't expired or blocked
                val event = normalizedRepo.findById(cache.normalizedEventId).orElse(null)
                event != null && event.status == EventStatus.VERIFIED
            }
            .sortedWith(
                compareByDescending<SaiaeCircleAlertCache> { riskOrdinal(it.effectiveRisk) }
                    .thenByDescending { it.renderedAt }
            )
            .map { it.toResponse() }

        return ResponseEntity.ok(cards)
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
