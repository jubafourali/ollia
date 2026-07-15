package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "saiae_context_report")
class SaiaeContextReport(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val normalizedEventId: UUID,

    @Column(nullable = false)
    val userId: UUID,

    @Column(nullable = false)
    val effectiveRisk: String,           // NORMAL | STAY_AWARE | IMPORTANT_DISRUPTION

    @Column(nullable = false)
    val floorApplied: Boolean = false,

    @Column(nullable = false)
    val userStatus: String,              // ACTIVE | QUIET | SILENT

    @Column(nullable = false)
    val locationRelevance: String,       // SAME_CITY | SAME_COUNTRY | BORDER_REGION | DISTANT | UNKNOWN

    @Column(columnDefinition = "TEXT", nullable = false)
    val calmSentence: String,

    @Column(nullable = false)
    val pushEligible: Boolean = false,

    @Column(nullable = false)
    val computedAt: Instant = Instant.now()
)