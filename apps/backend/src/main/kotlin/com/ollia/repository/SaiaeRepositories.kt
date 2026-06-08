package com.ollia.saiae.repository

import com.ollia.entity.SaiaeCircleAlertCache
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeContextReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaePushLog
import com.ollia.entity.SaiaeSourceRegistry
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

interface SaiaeSourceRegistryRepository : JpaRepository<SaiaeSourceRegistry, String>

interface SaiaeEventSourceMatchRepository : JpaRepository<SaiaeEventSourceMatch, UUID> {
    fun findAllByNormalizedEventId(normalizedEventId: UUID): List<SaiaeEventSourceMatch>
    fun findAllByNormalizedEventIdIn(normalizedEventIds: Collection<UUID>): List<SaiaeEventSourceMatch>
}

interface SaiaeConfidenceReportRepository : JpaRepository<SaiaeConfidenceReport, UUID> {
    fun findByNormalizedEventId(normalizedEventId: UUID): SaiaeConfidenceReport?
    fun findAllByNormalizedEventIdIn(normalizedEventIds: Collection<UUID>): List<SaiaeConfidenceReport>
}

interface SaiaeContextReportRepository : JpaRepository<SaiaeContextReport, UUID> {
    fun findAllByUserId(userId: UUID): List<SaiaeContextReport>
    fun findByNormalizedEventIdAndUserId(normalizedEventId: UUID, userId: UUID): SaiaeContextReport?

    @Modifying
    @Transactional
    @Query("""
        INSERT INTO saiae_context_report
            (id, normalized_event_id, user_id, effective_risk, floor_applied, user_status,
             location_relevance, calm_sentence, push_eligible, computed_at)
        VALUES (gen_random_uuid(), :eventId, :userId, :risk, :floor, :status,
                :location, :sentence, :pushEligible, NOW())
        ON CONFLICT (normalized_event_id, user_id) DO UPDATE SET
            effective_risk     = EXCLUDED.effective_risk,
            floor_applied      = EXCLUDED.floor_applied,
            user_status        = EXCLUDED.user_status,
            location_relevance = EXCLUDED.location_relevance,
            calm_sentence      = EXCLUDED.calm_sentence,
            push_eligible      = EXCLUDED.push_eligible,
            computed_at        = EXCLUDED.computed_at
    """, nativeQuery = true)
    fun upsert(
        @Param("eventId") eventId: UUID,
        @Param("userId") userId: UUID,
        @Param("risk") risk: String,
        @Param("floor") floor: Boolean,
        @Param("status") status: String,
        @Param("location") location: String,
        @Param("sentence") sentence: String,
        @Param("pushEligible") pushEligible: Boolean
    )
}

interface SaiaeCircleAlertCacheRepository : JpaRepository<SaiaeCircleAlertCache, UUID> {
    fun findAllByUserId(userId: UUID): List<SaiaeCircleAlertCache>
    fun findAllByUserIdIn(userIds: List<UUID>): List<SaiaeCircleAlertCache>
    fun findByNormalizedEventIdAndUserId(normalizedEventId: UUID, userId: UUID): SaiaeCircleAlertCache?

    @Modifying
    @Transactional
    @Query("""
        INSERT INTO saiae_circle_alert_cache
            (id, normalized_event_id, user_id, effective_risk, floor_applied,
             card_payload, push_payload, rendered_at)
        VALUES (gen_random_uuid(), :eventId, :userId, :risk, :floor,
                CAST(:card AS jsonb), CAST(:push AS jsonb), NOW())
        ON CONFLICT (normalized_event_id, user_id) DO UPDATE SET
            effective_risk = EXCLUDED.effective_risk,
            floor_applied  = EXCLUDED.floor_applied,
            card_payload   = EXCLUDED.card_payload,
            push_payload   = EXCLUDED.push_payload,
            rendered_at    = EXCLUDED.rendered_at
    """, nativeQuery = true)
    fun upsert(
        @Param("eventId") eventId: UUID,
        @Param("userId") userId: UUID,
        @Param("risk") risk: String,
        @Param("floor") floor: Boolean,
        @Param("card") cardJson: String,
        @Param("push") pushJson: String?
    )
}

interface SaiaePushLogRepository : JpaRepository<SaiaePushLog, UUID> {

    @Query("""
        SELECT * FROM saiae_push_log
        WHERE user_id = :userId
          AND event_type = :eventType
          AND (city = :city OR (city IS NULL AND :city IS NULL))
          AND sent_at > :since
        ORDER BY sent_at DESC
        LIMIT 1
    """, nativeQuery = true)
    fun findLatestInWindow(
        @Param("userId") userId: UUID,
        @Param("eventType") eventType: String,
        @Param("city") city: String?,
        @Param("since") since: Instant
    ): SaiaePushLog?

    @Query("""
        SELECT * FROM saiae_push_log
        WHERE user_id = :userId AND normalized_event_id = :eventId
        ORDER BY sent_at DESC
        LIMIT 1
    """, nativeQuery = true)
    fun findLatestForEvent(
        @Param("userId") userId: UUID,
        @Param("eventId") eventId: UUID
    ): SaiaePushLog?
}
