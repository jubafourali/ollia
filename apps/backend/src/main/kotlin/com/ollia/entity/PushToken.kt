package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "push_tokens")
class PushToken(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val userId: UUID,

    @Column(nullable = false)
    val token: String,

    @Column(nullable = false)
    val platform: String = "expo",

    val createdAt: Instant = Instant.now()
)
