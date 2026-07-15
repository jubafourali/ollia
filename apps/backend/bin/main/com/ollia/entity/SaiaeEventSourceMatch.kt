package com.ollia.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "saiae_event_source_match")
class SaiaeEventSourceMatch(

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: UUID? = null,

    @Column(nullable = false)
    val normalizedEventId: UUID,

    @Column(nullable = false)
    val sourceId: String,

    @Column(nullable = false)
    val reportedAt: Instant = Instant.now(),

    // null = original report; set = this source republished from originSourceId
    val originSourceId: String? = null
)