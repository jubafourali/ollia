package com.ollia.entity

import com.fasterxml.jackson.databind.JsonNode
import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "saiae_circle_alert_cache")
class SaiaeCircleAlertCache(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val normalizedEventId: UUID,

    @Column(nullable = false)
    val userId: UUID,

    @Column(nullable = false)
    val effectiveRisk: String,

    @Column(nullable = false)
    val floorApplied: Boolean = false,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    val cardPayload: JsonNode,

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    val pushPayload: JsonNode? = null,

    @Column(nullable = false)
    val renderedAt: Instant = Instant.now()
)