package com.ollia.dto

import java.util.UUID

data class NearbyMemberResponse(
    val memberId: UUID,
    val name:     String,
    val region:   String,
    val events:   List<NearbyEventResponse>,
    val isMe: Boolean = false
)