package com.ollia.repository

import com.ollia.entity.SafetyEvent
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface SafetyEventRepository : JpaRepository<SafetyEvent, UUID> {
    fun findAllByFetchedAtAfterOrderByEventTimeDesc(since: Instant): List<SafetyEvent>
    fun findAllByRegionIgnoreCaseAndFetchedAtAfterOrderByEventTimeDesc(region: String, since: Instant): List<SafetyEvent>
    fun deleteAllByFetchedAtBefore(before: Instant)
}
