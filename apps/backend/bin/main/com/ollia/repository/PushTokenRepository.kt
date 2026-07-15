package com.ollia.repository

import com.ollia.entity.PushToken
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.UUID

interface PushTokenRepository : JpaRepository<PushToken, UUID> {
    fun findByUserId(userId: UUID): PushToken?
    fun findAllByUserIdIn(userIds: List<UUID>): List<PushToken>
    fun deleteAllByUserId(userId: UUID)
    @Modifying(clearAutomatically = true, flushAutomatically = false)
    @Query(
        value = """
            INSERT INTO push_tokens (id, user_id, token, platform, created_at)
            VALUES (gen_random_uuid(), :userId, :token, :platform, now())
            ON CONFLICT (user_id) DO UPDATE SET token = :token, platform = :platform
        """,
        nativeQuery = true
    )
    fun upsertToken(
        @Param("userId") userId: UUID,
        @Param("token") token: String,
        @Param("platform") platform: String
    )
}
