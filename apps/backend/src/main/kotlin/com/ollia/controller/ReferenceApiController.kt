package com.ollia.controller

import com.ollia.dto.*
import com.ollia.entity.ActivitySignal
import com.ollia.entity.FamilyCircle
import com.ollia.entity.FamilyMember
import com.ollia.entity.PushToken
import com.ollia.repository.*
import com.ollia.service.ActivityPatternService
import com.ollia.service.CurrentUserService
import com.ollia.service.SafetyEventService
import com.ollia.service.StatusService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
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
    private val familyInviteRepository: FamilyInviteRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val statusService: StatusService,
    private val safetyEventService: SafetyEventService,
    private val activityPatternService: ActivityPatternService,
    private val clerkService: com.ollia.service.ClerkService
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
            createdAt = user.createdAt.toString(),
            plan = user.plan
        )
    }

    // ─── GET /api/users ─── get current user
    @GetMapping("/users")
    fun getMe(): ApiUserResponse {
        val clerkId = currentUserService.getClerkId()
        val user = userRepository.findByClerkId(clerkId)!!
        return ApiUserResponse(
            id = clerkId,
            name = user.name,
            region = user.region,
            travelMode = user.travelMode,
            travelDestination = user.travelDestination,
            createdAt = user.createdAt.toString(),
            plan = user.plan
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
        // Reset escalation chain on any activity signal
        if (user.escalationLevel > 0) {
            user.escalationLevel = 0
            user.escalationChangedAt = null
        }
        // Clear scheduled check-in deadline (user checked in)
        if (user.scheduledCheckInDeadline != null) {
            user.scheduledCheckInDeadline = null
        }
        userRepository.save(user)
        return ActivityResponse(
            recorded = true,
            timestamp = Instant.now().toString()
        )
    }

    // ─── GET /api/activity/shortcut?token={token} ─── shortcut heartbeat (no auth)
    // Response: { ok: true }
    @GetMapping("/activity/shortcut")
    fun shortcutHeartbeat(@RequestParam token: String): Map<String, Boolean> {
        val user = userRepository.findByShortcutToken(UUID.fromString(token))
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Invalid shortcut token")
        activitySignalRepository.save(
            ActivitySignal(userId = user.id!!, signalType = "shortcut")
        )
        user.lastSeenAt = Instant.now()
        if (user.escalationLevel > 0) {
            user.escalationLevel = 0
            user.escalationChangedAt = null
        }
        if (user.scheduledCheckInDeadline != null) {
            user.scheduledCheckInDeadline = null
        }
        userRepository.save(user)
        return mapOf("ok" to true)
    }

    // ─── GET /api/users/me/shortcut-token ─── get or generate shortcut token
    // Response: { token: string }
    @GetMapping("/users/me/shortcut-token")
    fun getShortcutToken(): ShortcutTokenResponse {
        val user = currentUserService.getCurrentUser()
        if (user.shortcutToken == null) {
            user.shortcutToken = UUID.randomUUID()
            userRepository.save(user)
        }
        return ShortcutTokenResponse(token = user.shortcutToken.toString())
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
                id = member.id.toString(),
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
            // Enforce free plan cap — check circle owner's user plan
            val circleOwner = userRepository.findById(circle.ownerId).orElse(null)
            if (circleOwner?.plan != "premium") {
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

    // ─── DELETE /api/circles/{circleId}/members/{memberId} ─── remove member
    @DeleteMapping("/circles/{circleId}/members/{memberId}")
    @Transactional
    fun removeMember(
        @PathVariable circleId: String,
        @PathVariable memberId: String
    ): Map<String, Boolean> {
        val currentUser = currentUserService.getCurrentUser()
        val circle = familyCircleRepository.findById(UUID.fromString(circleId))
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Circle not found") }

        // Only circle owner can remove members
        if (circle.ownerId != currentUser.id) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the circle owner can remove members")
        }

        val member = familyMemberRepository.findById(UUID.fromString(memberId))
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found") }

        // Prevent owner from removing themselves
        if (member.userId == currentUser.id) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot remove yourself from the circle")
        }

        familyMemberRepository.delete(member)
        return mapOf("success" to true)
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
        if (request.travelMode && user.plan != "premium") {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Travel mode requires a Premium subscription")
        }
        user.travelMode = request.travelMode
        user.travelDestination = if (request.travelMode) request.travelDestination else null
        userRepository.save(user)
        return ApiUserResponse(
            id = currentUserService.getClerkId(),
            name = user.name,
            region = user.region,
            travelMode = user.travelMode,
            travelDestination = user.travelDestination,
            createdAt = user.createdAt.toString(),
            plan = user.plan
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

    // ─── PATCH /api/users/me/preferences ─── update notification preferences
    // Request: { notifyActivity?: boolean, notifyInactivity?: boolean }
    // Response: PreferencesResponse
    @PatchMapping("/users/me/preferences")
    fun updatePreferences(@RequestBody request: UpdatePreferencesRequest): PreferencesResponse {
        val user = currentUserService.getCurrentUser()
        if (request.notifyActivity != null) user.notifyActivity = request.notifyActivity
        if (request.notifyInactivity != null) user.notifyInactivity = request.notifyInactivity
        userRepository.save(user)
        return PreferencesResponse(
            notifyActivity = user.notifyActivity,
            notifyInactivity = user.notifyInactivity
        )
    }

    // ─── GET /api/users/me/preferences ─── get notification preferences
    @GetMapping("/users/me/preferences")
    fun getPreferences(): PreferencesResponse {
        val user = currentUserService.getCurrentUser()
        return PreferencesResponse(
            notifyActivity = user.notifyActivity,
            notifyInactivity = user.notifyInactivity
        )
    }

    // ─── GET /api/users/me/safety-preferences ─── get safety preferences (Premium)
    @GetMapping("/users/me/safety-preferences")
    fun getSafetyPreferences(): SafetyPreferencesResponse {
        val user = currentUserService.getCurrentUser()
        return SafetyPreferencesResponse(
            inactivityThresholdHours = user.inactivityThresholdHours,
            scheduledCheckInDeadline = user.scheduledCheckInDeadline?.toString()
        )
    }

    // ─── PATCH /api/users/me/safety-preferences ─── update safety preferences (Premium)
    @PatchMapping("/users/me/safety-preferences")
    fun updateSafetyPreferences(@RequestBody request: UpdateSafetyPreferencesRequest): SafetyPreferencesResponse {
        val user = currentUserService.getCurrentUser()
        if (user.plan != "premium") {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Safety preferences require a Premium subscription")
        }
        if (request.inactivityThresholdHours != null) {
            val clamped = request.inactivityThresholdHours.coerceIn(1, 24)
            user.inactivityThresholdHours = clamped
        }
        if (request.scheduledCheckInDeadline != null) {
            user.scheduledCheckInDeadline = Instant.parse(request.scheduledCheckInDeadline)
        }
        userRepository.save(user)
        return SafetyPreferencesResponse(
            inactivityThresholdHours = user.inactivityThresholdHours,
            scheduledCheckInDeadline = user.scheduledCheckInDeadline?.toString()
        )
    }

    // ─── DELETE /api/users/me/scheduled-checkin ─── cancel scheduled check-in
    @DeleteMapping("/users/me/scheduled-checkin")
    fun cancelScheduledCheckIn(): SafetyPreferencesResponse {
        val user = currentUserService.getCurrentUser()
        user.scheduledCheckInDeadline = null
        userRepository.save(user)
        return SafetyPreferencesResponse(
            inactivityThresholdHours = user.inactivityThresholdHours,
            scheduledCheckInDeadline = null
        )
    }

    // ─── GET /api/users/me/emergency-contact ─── get emergency contact
    @GetMapping("/users/me/emergency-contact")
    fun getEmergencyContact(): EmergencyContactResponse {
        val user = currentUserService.getCurrentUser()
        return EmergencyContactResponse(
            name = user.emergencyContactName,
            phone = user.emergencyContactPhone
        )
    }

    // ─── PATCH /api/users/me/emergency-contact ─── set emergency contact
    @PatchMapping("/users/me/emergency-contact")
    fun updateEmergencyContact(@RequestBody request: UpdateEmergencyContactRequest): EmergencyContactResponse {
        val user = currentUserService.getCurrentUser()
        user.emergencyContactName = request.name
        user.emergencyContactPhone = request.phone
        userRepository.save(user)
        return EmergencyContactResponse(
            name = user.emergencyContactName,
            phone = user.emergencyContactPhone
        )
    }

    // ─── PATCH /api/users/me/language ─── update preferred language
    @PatchMapping("/users/me/language")
    fun updatePreferredLanguage(@RequestBody request: UpdateLanguageRequest): Map<String, String> {
        val user = currentUserService.getCurrentUser()
        val supported = listOf("en", "fr", "ar", "bs")
        user.preferredLanguage = if (request.preferredLanguage in supported) request.preferredLanguage else "en"
        userRepository.save(user)
        return mapOf("preferredLanguage" to user.preferredLanguage)
    }

    // ─── DELETE /api/users/me ─── delete account and all associated data
    // Response: 204 No Content
    @DeleteMapping("/users/me")
    @Transactional
    fun deleteAccount(): Map<String, Boolean> {
        val user = currentUserService.getCurrentUser()
        userRepository.delete(user)
        clerkService.deleteUserAsync(user.clerkId)
        return mapOf("success" to true)
    }

    // ─── POST /api/push-tokens ─── upsert push notification token
    // Request: { token: string, platform?: string }
    // Response: { success: true }
    @PostMapping("/push-tokens")
    @Transactional
    fun registerPushToken(@RequestBody request: PushTokenRequest): Map<String, Boolean> {
        val user = currentUserService.getCurrentUser()
        pushTokenRepository.deleteAllByUserId(user.id!!)
        pushTokenRepository.upsertToken(userId = user.id, token = request.token, platform = request.platform)
        return mapOf("success" to true)
    }

    // ─── DELETE /api/push-tokens ─── remove push notification token on sign out
    // Response: { success: true }
    @DeleteMapping("/push-tokens")
    @Transactional
    fun deregisterPushToken(): Map<String, Boolean> {
        val user = currentUserService.getCurrentUser()
        pushTokenRepository.deleteAllByUserId(user.id!!)
        return mapOf("success" to true)
    }
}
