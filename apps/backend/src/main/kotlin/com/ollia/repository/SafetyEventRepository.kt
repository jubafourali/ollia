package com.ollia.repository

import com.ollia.entity.SafetyEvent
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

interface SafetyEventRepository : JpaRepository<SafetyEvent, UUID> {
    fun findAllByFetchedAtAfterOrderByEventTimeDesc(since: Instant): List<SafetyEvent>
    fun findAllByRegionIgnoreCaseAndFetchedAtAfterOrderByEventTimeDesc(region: String, since: Instant): List<SafetyEvent>

    @Modifying
    @Transactional
    @Query("DELETE FROM SafetyEvent e WHERE e.source = :source")
    fun deleteBySource(@Param("source") source: String)

    @Modifying
    @Transactional
    @Query("DELETE FROM SafetyEvent e WHERE e.fetchedAt < :cutoff")
    fun deleteAllByFetchedAtBefore(@Param("cutoff") cutoff: Instant)
}