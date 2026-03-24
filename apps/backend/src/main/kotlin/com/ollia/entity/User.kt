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

    @Column(nullable = false)
    var travelMode: Boolean = false,

    var travelDestination: String? = null,

    var lastSeenAt: Instant? = null,

    @Column(nullable = false)
    var plan: String = "free",

    var stripeCustomerId: String? = null,

    var stripeSubscriptionId: String? = null,

    val createdAt: Instant = Instant.now()
)
