package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "saiae_confidence_report")
class SaiaeConfidenceReport(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false, unique = true)
    val normalizedEventId: UUID,

    @Column(nullable = false)
    val score: Int,

    @Column(nullable = false)
    val tier: String,            // HIGH | MODERATE | LOW | BLOCKED

    @Column(nullable = false)
    val independentOrigins: Int,

    @Column(nullable = false)
    val conflictingReports: Boolean = false,

    val conflictType: String? = null,    // EXISTENCE | DETAIL | null

    val conflictNote: String? = null,

    @Column(nullable = false)
    val minimumSourcesMet: Boolean,

    @Column(nullable = false)
    val computedAt: Instant = Instant.now()
)