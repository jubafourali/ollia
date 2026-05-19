// ─── NormalizedSafetyEventRepository.kt ──────────────────────────────────────
package com.ollia.repository

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

interface NormalizedSafetyEventRepository : JpaRepository<NormalizedSafetyEvent, UUID> {

    fun findAllByStatus(status: EventStatus): List<NormalizedSafetyEvent>

    fun findAllByStatusIn(statuses: List<EventStatus>): List<NormalizedSafetyEvent>

    @Modifying
    @Transactional
    @Query("UPDATE NormalizedSafetyEvent e SET e.status = :status WHERE e.id = :id")
    fun updateStatus(@Param("id") id: UUID, @Param("status") status: EventStatus)

    @Modifying
    @Transactional
    @Query("""
        UPDATE NormalizedSafetyEvent e SET e.status = 'EXPIRED'
        WHERE e.status NOT IN ('EXPIRED', 'REJECTED')
          AND e.expiresAt IS NOT NULL
          AND e.expiresAt < :now
    """)
    fun expireStale(@Param("now") now: Instant): Int

    @Modifying
    @Transactional
    @Query("""
        UPDATE NormalizedSafetyEvent e
        SET e.riskLevel = :riskLevel, e.riskScore = :riskScore, e.floorApplied = :floorApplied
        WHERE e.id = :id
    """)
    fun updateRisk(
        @Param("id") id: UUID,
        @Param("riskLevel") riskLevel: String,
        @Param("riskScore") riskScore: Int,
        @Param("floorApplied") floorApplied: Boolean
    )
}

// ─── RawSafetySignalRepository additions ─────────────────────────────────────
// Add these methods to the existing RawSafetySignalRepository interface

// findAllUnprocessed and markProcessed need to be added to the existing interface.
// Since we can't extend a sealed interface in another file, place these as
// additional query methods directly in RawSafetySignalRepository.kt:

/*
  Add to existing RawSafetySignalRepository:

  @Query("SELECT e FROM RawSafetyEvent e WHERE e.processed = false ORDER BY e.collectedAt ASC")
  fun findAllUnprocessed(): List<RawSafetyEvent>

  @Modifying
  @Transactional
  @Query("UPDATE RawSafetyEvent e SET e.processed = true WHERE e.id = :id")
  fun markProcessed(@Param("id") id: UUID)
*/
