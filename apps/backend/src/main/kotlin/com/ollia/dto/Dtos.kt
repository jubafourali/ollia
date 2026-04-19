package com.ollia.dto

import java.time.Instant

// === Reference API Contract DTOs ===

// POST /api/users — request
data class UpsertUserRequest(
    val id: String,
    val name: String,
    val region: String? = null,
    val timezone: String? = null
)

// POST /api/users — response, PATCH /api/users/{userId}/travel — response
data class ApiUserResponse(
    val id: String,
    val name: String,
    val region: String? = null,
    val travelMode: Boolean? = null,
    val travelDestination: String? = null,
    val createdAt: String? = null,
    val plan: String? = null,
    val foundingMember: Boolean = false,
    val foundingExpiresAt: String? = null,
    val foundingClaimedAt: String? = null,
    )

// POST /api/activity — request
data class ActivityRequest(
    val userId: String,
    val signalType: String = "heartbeat"
)

// POST /api/activity — response
data class ActivityResponse(
    val recorded: Boolean,
    val timestamp: String
)

// POST /api/circles — request
data class CreateCircleRequest(
    val ownerId: String
)

// Circle detail — response for POST /api/circles, PATCH /api/circles/{id}/plan
data class CircleDetailResponse(
    val id: String,
    val inviteCode: String,
    val ownerId: String,
    val plan: String? = null,
    val createdAt: String? = null
)

// Circle member within CircleWithMembers
data class CircleMemberResponse(
    val id: String,
    val userId: String,
    val name: String,
    val region: String? = null,
    val relation: String,
    val lastCheckInAt: String? = null,
    val lastSeen: String? = null,
    val joinedAt: String? = null,
    val travelMode: Boolean? = null,
    val travelDestination: String? = null
)

// GET /api/circles/{circleId} — response, POST /api/circles/join — response
data class CircleWithMembersResponse(
    val id: String,
    val inviteCode: String,
    val ownerId: String,
    val plan: String? = null,
    val createdAt: String? = null,
    val members: List<CircleMemberResponse>
)

// POST /api/circles/join — request
data class JoinCircleRequest(
    val inviteCode: String,
    val userId: String,
    val relation: String? = null
)

// PATCH /api/circles/{circleId}/plan — request
data class UpdatePlanRequest(
    val plan: String
)

// PATCH /api/users/{userId}/travel — request
data class SetTravelModeRequest(
    val travelMode: Boolean,
    val travelDestination: String? = null
)

// GET /api/safety-events — response item
data class SafetyEventResponse(
    val id: String,
    val type: String,
    val title: String,
    val description: String? = null,
    val region: String? = null,
    val severity: String,
    val source: String? = null,
    val sourceUrl: String? = null,
    val lat: String? = null,
    val lon: String? = null,
    val eventTime: String? = null
)

// GET /api/users/{userId}/patterns — response
data class PatternResponse(
    val hasPattern: Boolean,
    val peakHours: List<Int>? = null,
    val missedPeaks: List<Int>? = null,
    val totalSignals: Int? = null,
    val todaySignals: Int? = null,
    val insight: String? = null
)

// POST /api/subscriptions/checkout — request
data class CheckoutRequest(val plan: String) // "monthly" | "annual"

// POST /api/subscriptions/checkout — response
data class CheckoutResponse(val url: String)

// GET /api/subscriptions/status — response
data class SubscriptionStatusResponse(
    val plan: String,
    val subscriptionId: String? = null
)

// PATCH /api/users/me/preferences — request
data class UpdatePreferencesRequest(
    val notifyActivity: Boolean? = null,
    val notifyInactivity: Boolean? = null
)

// PATCH /api/users/me/preferences — response
data class PreferencesResponse(
    val notifyActivity: Boolean,
    val notifyInactivity: Boolean
)

// GET/PATCH /api/users/me/emergency-contact — response
data class EmergencyContactResponse(
    val name: String?,
    val phone: String?
)

// PATCH /api/users/me/emergency-contact — request
data class UpdateEmergencyContactRequest(
    val name: String?,
    val phone: String?
)

// GET /api/users/me/safety-preferences — response
data class SafetyPreferencesResponse(
    val inactivityThresholdHours: Int,
    val scheduledCheckInDeadline: String?,
    val urgentOvernightAlerts: Boolean
)

// PATCH /api/users/me/safety-preferences — request
data class UpdateSafetyPreferencesRequest(
    val inactivityThresholdHours: Int? = null,
    val scheduledCheckInDeadline: String? = null,
    val urgentOvernightAlerts: Boolean? = null
)

// PATCH /api/users/me/language — request
data class UpdateLanguageRequest(val preferredLanguage: String)

// GET /api/users/me/shortcut-token — response
data class ShortcutTokenResponse(val token: String)

// Legacy DTOs kept for scheduler/push
data class PushTokenRequest(val token: String, val platform: String = "expo")
