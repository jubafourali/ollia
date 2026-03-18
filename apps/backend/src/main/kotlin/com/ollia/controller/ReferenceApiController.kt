package com.ollia.controller

import com.ollia.dto.*
import com.ollia.entity.ActivitySignal
import com.ollia.entity.FamilyCircle
import com.ollia.entity.FamilyMember
import com.ollia.repository.*
import com.ollia.service.ActivityPatternService
import com.ollia.service.CurrentUserService
import com.ollia.service.SafetyEventService
import com.ollia.service.StatusService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

/**
 * Implements the EXACT API contract from the reference Replit app.
 * Every endpoint path, request body, and response shape matches
 * the reference's utils/api.ts types precisely.
 */
@RestController
@RequestMapping("/api")
class ReferenceApiController(
    private val currentUserService: CurrentUserService,
    private val userRepository: UserRepository,
    private val activitySignalRepository: ActivitySignalRepository,
    private val familyCircleRepository: FamilyCircleRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val statusService: StatusService,
    private val safetyEventService: SafetyEventService,
    private val activityPatternService: ActivityPatternService
) {

    companion object {
        const val FREE_PLAN_MEMBER_LIMIT = 3
    }

    // ─── POST /api/users ─── upsert user
    // Request: { id: string, name: string, region?: string }
    // Response: ApiUser
    @PostMapping("/users")
    fun upsertUser(@RequestBody request: UpsertUserRequest): ApiUserResponse {
        val clerkId = currentUserService.getClerkId()
        // The `id` from the frontend is the Clerk userId — use clerkId from JWT
        userRepository.upsertByClerkId(
            id = UUID.randomUUID().toString(),
            clerkId = clerkId,
            name = request.name,
            email = "$clerkId@ollia.app"
        )
        val user = userRepository.findByClerkId(clerkId)!!
        if (request.region != null) {
            user.region = request.region
            userRepository.save(user)
        }
        return ApiUserResponse(
            id = clerkId,
            name = user.name,
            region = user.region,
            travelMode = user.travelMode,
            travelDestination = user.travelDestination,
            createdAt = user.createdAt.toString()
        )
    }

    // ─── POST /api/activity ─── send heartbeat
    // Request: { userId: string, signalType: string }
    // Response: { recorded: boolean, timestamp: string }
    @PostMapping("/activity")
    fun sendActivity(@RequestBody request: ActivityRequest): ActivityResponse {
        val user = currentUserService.getCurrentUser()
        activitySignalRepository.save(
            ActivitySignal(userId = user.id!!, signalType = request.signalType)
        )
        user.lastSeenAt = Instant.now()
        userRepository.save(user)
        return ActivityResponse(
            recorded = true,
            timestamp = Instant.now().toString()
        )
    }

    // ─── POST /api/circles ─── create circle
    // Request: { ownerId: string }
    // Response: CircleDetail
    @PostMapping("/circles")
    fun createCircle(@RequestBody request: CreateCircleRequest): CircleDetailResponse {
        val user = currentUserService.getCurrentUser()
        // Check if user already owns a circle
        var circle = familyCircleRepository.findByOwnerId(user.id!!)
        if (circle == null) {
            circle = familyCircleRepository.save(
                FamilyCircle(ownerId = user.id!!, inviteCode = UUID.randomUUID().toString())
            )
            // Owner becomes a member
            familyMemberRepository.save(
                FamilyMember(circleId = circle.id!!, userId = user.id!!, role = "owner", relation = "Family")
            )
        }
        return CircleDetailResponse(
            id = circle.id.toString(),
            inviteCode = circle.inviteCode,
            ownerId = currentUserService.getClerkId(),
            plan = circle.plan,
            createdAt = circle.createdAt.toString()
        )
    }

    // ─── GET /api/circles/{circleId} ─── get circle with members
    // Response: CircleWithMembers
    @GetMapping("/circles/{circleId}")
    fun getCircle(@PathVariable circleId: String): CircleWithMembersResponse {
        val circle = familyCircleRepository.findById(UUID.fromString(circleId))
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Circle not found") }

        val members = familyMemberRepository.findAllByCircleId(circle.id!!)
        val memberResponses = members.mapNotNull { member ->
            val memberUser = userRepository.findById(member.userId).orElse(null) ?: return@mapNotNull null
            CircleMemberResponse(
                userId = memberUser.clerkId,
                name = memberUser.name,
                region = memberUser.region,
                relation = member.relation,
                status = statusService.computeStatus(memberUser.lastSeenAt),
                lastSeen = memberUser.lastSeenAt?.toString(),
                joinedAt = null,
                travelMode = memberUser.travelMode,
                travelDestination = memberUser.travelDestination
            )
        }

        val owner = userRepository.findById(circle.ownerId).orElse(null)

        return CircleWithMembersResponse(
            id = circle.id.toString(),
            inviteCode = circle.inviteCode,
            ownerId = owner?.clerkId ?: "",
            plan = circle.plan,
            createdAt = circle.createdAt.toString(),
            members = memberResponses
        )
    }

    // ─── POST /api/circles/join ─── join circle via invite code
    // Request: { inviteCode: string, userId: string, relation?: string }
    // Response: CircleWithMembers
    @PostMapping("/circles/join")
    fun joinCircle(@RequestBody request: JoinCircleRequest): CircleWithMembersResponse {
        val user = currentUserService.getCurrentUser()
        val circle = familyCircleRepository.findByInviteCode(request.inviteCode)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Invite code not found")

        // Check if already a member
        val existing = familyMemberRepository.findByCircleIdAndUserId(circle.id!!, user.id!!)
        if (existing == null) {
            // Enforce free plan cap
            if (circle.plan == "free") {
                val count = familyMemberRepository.countByCircleId(circle.id!!)
                if (count >= FREE_PLAN_MEMBER_LIMIT) {
                    throw ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "Member limit reached. Free plan allows $FREE_PLAN_MEMBER_LIMIT members."
                    )
                }
            }
            familyMemberRepository.save(
                FamilyMember(
                    circleId = circle.id!!,
                    userId = user.id!!,
                    relation = request.relation ?: "Family"
                )
            )
        }

        // Return the full circle with members
        return getCircle(circle.id.toString())
    }

    // ─── PATCH /api/circles/{circleId}/plan ─── upgrade plan
    // Request: { plan: string }
    // Response: CircleDetail
    @PatchMapping("/circles/{circleId}/plan")
    fun upgradePlan(
        @PathVariable circleId: String,
        @RequestBody request: UpdatePlanRequest
    ): CircleDetailResponse {
        val circle = familyCircleRepository.findById(UUID.fromString(circleId))
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Circle not found") }
        circle.plan = request.plan
        familyCircleRepository.save(circle)
        val owner = userRepository.findById(circle.ownerId).orElse(null)
        return CircleDetailResponse(
            id = circle.id.toString(),
            inviteCode = circle.inviteCode,
            ownerId = owner?.clerkId ?: "",
            plan = circle.plan,
            createdAt = circle.createdAt.toString()
        )
    }

    // ─── PATCH /api/users/{userId}/travel ─── set travel mode
    // Request: { travelMode: boolean, travelDestination?: string }
    // Response: ApiUser
    @PatchMapping("/users/{userId}/travel")
    fun setTravelMode(
        @PathVariable userId: String,
        @RequestBody request: SetTravelModeRequest
    ): ApiUserResponse {
        val user = currentUserService.getCurrentUser()
        user.travelMode = request.travelMode
        user.travelDestination = if (request.travelMode) request.travelDestination else null
        userRepository.save(user)
        return ApiUserResponse(
            id = currentUserService.getClerkId(),
            name = user.name,
            region = user.region,
            travelMode = user.travelMode,
            travelDestination = user.travelDestination,
            createdAt = user.createdAt.toString()
        )
    }

    // ─── GET /api/safety-events ─── get safety events
    // Response: ApiSafetyEvent[]
    @GetMapping("/safety-events")
    fun getSafetyEvents(): List<SafetyEventResponse> {
        return safetyEventService.getEvents().map { event ->
            SafetyEventResponse(
                id = event.id.toString(),
                type = event.type,
                title = event.title,
                description = event.description,
                region = event.region,
                severity = event.severity,
                source = event.source,
                sourceUrl = event.sourceUrl,
                lat = event.lat?.toString(),
                lon = event.lon?.toString(),
                eventTime = event.eventTime.toString()
            )
        }
    }

    // ─── GET /api/users/{userId}/patterns ─── get activity patterns
    // Response: ApiPattern
    @GetMapping("/users/{userId}/patterns")
    fun getPatterns(@PathVariable userId: String): PatternResponse {
        val user = currentUserService.getCurrentUser()
        val pattern = activityPatternService.analyzePatterns(user.id!!)

        val peakHours = if (pattern.mostActiveHour != null) listOf(pattern.mostActiveHour) else emptyList()
        val hasPattern = pattern.totalSignals > 0

        val insight = if (pattern.streakDays > 0) {
            "You've been active for ${pattern.streakDays} days in a row. Average ${pattern.averageSignalsPerDay} signals per day."
        } else null

        return PatternResponse(
            hasPattern = hasPattern,
            peakHours = peakHours,
            missedPeaks = emptyList(),
            totalSignals = pattern.totalSignals,
            todaySignals = 0,
            insight = insight
        )
    }
}
