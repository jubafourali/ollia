package com.ollia.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant


@Entity
@Table(name = "collector_checkpoints")
class CollectorCheckpoint(

    @Id
    @Column(name = "source", nullable = false)
    val source: String,

    @Column(name = "last_fetched_at", nullable = false)
    val lastFetchedAt: Instant,

    @Column(name = "cursor")
    val cursor: String? = null,

    @Column(name = "status", nullable = false)
    val status: String = "SUCCESS"
)