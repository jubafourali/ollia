package com.ollia.entity

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

/**
 * Drop-in replacement for the existing NormalizedSafetyEvent.kt.
 * Adds SAIAE columns: riskLevel, riskScore, floorApplied, expiresAt.
 * All existing columns unchanged.
 */
@Entity
@Table(
    name = "normalized_safety_events",
    indexes = [
        Index(name = "idx_event_country",  columnList = "country"),
        Index(name = "idx_event_city",     columnList = "city"),
        Index(name = "idx_event_category", columnList = "category"),
        Index(name = "idx_event_status",   columnList = "status"),
        Index(name = "idx_norm_event_risk",    columnList = "risk_level"),
        Index(name = "idx_norm_event_expires", columnList = "expires_at")
    ]
)
class NormalizedSafetyEvent(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    // TODO verify if we should give it new value
    val id: UUID? = UUID.randomUUID(),

    @Column(name = "raw_signal_id")
    val rawSignalId: UUID,

    @Enumerated(EnumType.STRING)
    val source: SourceType,

    @Enumerated(EnumType.STRING)
    val category: SafetyCategory,

    @Enumerated(EnumType.STRING)
    val severity: Severity,

    val title: String,

    @Column(length = 5000)
    val description: String?,

    val country: String?,

    val city: String?,

    val latitude: Double?,

    val longitude: Double?,

    @Column(name = "radius_km")
    val radiusKm: Double?,

    @Column(name = "event_occurred_at")
    val eventOccurredAt: Instant?,

    @Column(name = "normalized_at")
    val normalizedAt: Instant = Instant.now(),

    @Enumerated(EnumType.STRING)
    var status: EventStatus = EventStatus.PENDING_VERIFICATION,

    @Column(name = "risk_level")
    var riskLevel: String? = null,       // NORMAL | STAY_AWARE | IMPORTANT_DISRUPTION

    @Column(name = "risk_score")
    var riskScore: Int? = null,

    @Column(name = "floor_applied")
    var floorApplied: Boolean = false,

    @Column(name = "expires_at")
    var expiresAt: Instant? = null
)