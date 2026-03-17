package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "family_invites")
class FamilyInvite(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val circleId: UUID,

    @Column(unique = true, nullable = false)
    val token: String,

    @Column(nullable = false)
    val createdBy: UUID,

    @Column(nullable = false)
    val expiresAt: Instant,

    var usedAt: Instant? = null,

    var usedBy: UUID? = null,

    val createdAt: Instant = Instant.now()
)
