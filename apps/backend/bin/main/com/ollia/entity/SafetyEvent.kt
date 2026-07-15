package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "safety_events")
class SafetyEvent(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val type: String,

    @Column(nullable = false)
    val title: String,

    @Column(columnDefinition = "TEXT")
    val description: String? = null,

    val region: String? = null,

    @Column(nullable = false)
    val severity: String,

    val source: String? = null,

    val sourceUrl: String? = null,

    val lat: Double? = null,

    val lon: Double? = null,

    @Column(nullable = false)
    val eventTime: Instant,

    @Column(nullable = false)
    val fetchedAt: Instant = Instant.now()
)
