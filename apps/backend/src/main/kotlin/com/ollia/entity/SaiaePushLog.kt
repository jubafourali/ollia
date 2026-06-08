package com.ollia.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "saiae_push_log")
class SaiaePushLog(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val userId: UUID,

    // The specific event this push was about — used for per-event dedup.
    // Nullable for legacy rows written before correlation existed.
    @Column(name = "normalized_event_id")
    val normalizedEventId: UUID? = null,

    @Column(nullable = false)
    val eventType: String,

    val city: String? = null,

    @Column(nullable = false)
    val sentAt: Instant = Instant.now(),

    @Column(nullable = false)
    val riskLevelAtSend: String,

    @Column(nullable = false)
    val confidenceAtSend: Int,

    @Column(nullable = false)
    val userStatusAtSend: String
)