package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class User(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(unique = true, nullable = false)
    val clerkId: String,

    @Column(nullable = false)
    var name: String,

    @Column(nullable = false)
    var email: String,

    var region: String? = null,

    var lastSeenAt: Instant? = null,

    val createdAt: Instant = Instant.now()
)
