package com.ollia.repository

import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SourceType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*

interface RawSafetySignalRepository: JpaRepository<RawSafetyEvent, UUID> {

    fun existsBySourceAndExternalId(source: SourceType, externalId: String): Boolean

    fun existsBySourceAndContentHash(source: SourceType, contentHash: String): Boolean

    fun findAllByCollectedAtAfterOrderByCollectedAtDesc(since: Instant): List<RawSafetyEvent>

    @Query("SELECT e FROM RawSafetyEvent e WHERE e.processed = false ORDER BY e.collectedAt ASC")
    fun findAllUnprocessed(): List<RawSafetyEvent>

    @Modifying
    @Transactional
    @Query("UPDATE RawSafetyEvent e SET e.processed = true WHERE e.id = :id")
    fun markProcessed(@Param("id") id: UUID)

    @Modifying
    @Transactional
    // TODO double check if this is how we do IN ()
    @Query("UPDATE RawSafetyEvent e SET e.processed = true WHERE e.id in (:ids)")
    fun markProcessed(@Param("ids") id: Set<UUID>)
}