package com.ollia.entity

import com.fasterxml.jackson.databind.JsonNode
import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

/**
 * Drop-in replacement for existing RawSafetyEvent.kt.
 * Adds: processed: Boolean (V24 migration adds this column).
 * All other fields unchanged.
 */
@Entity
@Table(
    name = "raw_safety_events",
    indexes = [
        Index(name = "idx_signal_source",           columnList = "source"),
        Index(name = "idx_signal_collected_at",      columnList = "collected_at"),
        Index(name = "idx_signal_external_id",       columnList = "external_id"),
        Index(name = "idx_signal_event_occurred_at", columnList = "event_occurred_at"),
        Index(name = "idx_raw_signal_processed",     columnList = "processed")
    ]
)
class RawSafetyEvent(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    val source: SourceType,

    @Column(name = "external_id")
    val externalId: String? = null,

    @Column(length = 1000)
    val title: String? = null,

    @Column(length = 5000)
    val description: String? = null,

    @Column(name = "source_url")
    val sourceUrl: String? = null,

    val country: String? = null,

    val city: String? = null,

    val latitude: Double? = null,

    val longitude: Double? = null,

    @Column(name = "event_occurred_at")
    val eventOccurredAt: Instant? = null,

    @Column(name = "collected_at", nullable = false)
    val collectedAt: Instant = Instant.now(),

    @Enumerated(EnumType.STRING)
    val category: SafetyCategory? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "severity_hint")
    val severityHint: Severity? = null,

    val language: String? = null,

    @Column(name = "content_hash", nullable = false)
    val contentHash: String,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    val rawPayload: JsonNode,

    // Added in V24 — marks whether this signal has been through the normalizer
    @Column(nullable = false)
    var processed: Boolean = false
)

/**
 * Drop-in replacement for existing RawSafetyEvent.kt.
 * Adds: processed: Boolean (V24 migration adds this column).
 * All other fields unchanged.
 */
@Entity
@Table(
    name = "raw_safety_events",
    indexes = [
        Index(name = "idx_signal_source",           columnList = "source"),
        Index(name = "idx_signal_collected_at",      columnList = "collected_at"),
        Index(name = "idx_signal_external_id",       columnList = "external_id"),
        Index(name = "idx_signal_event_occurred_at", columnList = "event_occurred_at"),
        Index(name = "idx_raw_signal_processed",     columnList = "processed")
    ]
)
class RawSafetyEvent(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    val source: SourceType,

    @Column(name = "external_id")
    val externalId: String? = null,

    @Column(length = 1000)
    val title: String? = null,

    @Column(length = 5000)
    val description: String? = null,

    @Column(name = "source_url")
    val sourceUrl: String? = null,

    val country: String? = null,

    val city: String? = null,

    val latitude: Double? = null,

    val longitude: Double? = null,

    @Column(name = "event_occurred_at")
    val eventOccurredAt: Instant? = null,

    @Column(name = "collected_at", nullable = false)
    val collectedAt: Instant = Instant.now(),

    @Enumerated(EnumType.STRING)
    val category: SafetyCategory? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "severity_hint")
    val severityHint: Severity? = null,

    val language: String? = null,

    @Column(name = "content_hash", nullable = false)
    val contentHash: String,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    val rawPayload: JsonNode,

    // Added in V24 — marks whether this signal has been through the normalizer
    @Column(nullable = false)
    var processed: Boolean = false
)