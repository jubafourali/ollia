package com.ollia.dto

import java.util.UUID

data class NearbyEventResponse(
    val eventId:      UUID,
    val eventLabel:   String,
    val sentence:     String,
    val riskLevel:    String,
    val sourcesLabel: String,
    val category:     String
)
