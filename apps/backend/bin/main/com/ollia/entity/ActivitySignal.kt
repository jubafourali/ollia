package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "activity_signals")
class ActivitySignal(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val userId: UUID,

    @Column(nullable = false)
    val signalType: String = "heartbeat",

    val createdAt: Instant = Instant.now()
)
