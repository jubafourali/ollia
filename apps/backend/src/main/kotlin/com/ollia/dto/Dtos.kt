package com.ollia.dto

import java.time.Instant

data class HeartbeatResponse(val status: String = "ok")

data class StatusResponse(
    val status: String,
    val lastSeenAt: Instant?
)

data class FamilyMemberResponse(
    val userId: String,
    val name: String,
    val status: String,
    val lastSeenAt: Instant?
)

data class FamilyResponse(val members: List<FamilyMemberResponse>)

data class InviteResponse(val token: String, val deepLink: String)

data class CreateUserRequest(val name: String, val email: String, val region: String? = null)

data class PushTokenRequest(val token: String, val platform: String = "expo")

data class UpdateUserRequest(val name: String? = null, val region: String? = null)
