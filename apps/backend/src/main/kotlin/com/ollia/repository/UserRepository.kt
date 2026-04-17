package com.ollia.repository

import com.ollia.entity.User
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

interface UserRepository : JpaRepository<User, UUID> {
    fun findByClerkId(clerkId: String): User?
    fun findByShortcutToken(shortcutToken: UUID): User?
    fun findByStripeCustomerId(stripeCustomerId: String): User?
    fun findAllByLastSeenAtBefore(threshold: Instant): List<User>
    fun findAllByEscalationLevelAndLastSeenAtBefore(escalationLevel: Int, threshold: Instant): List<User>
    fun findAllByEscalationLevelAndEscalationChangedAtBefore(escalationLevel: Int, threshold: Instant): List<User>
    fun findAllByScheduledCheckInDeadlineBeforeAndEscalationLevel(deadline: Instant, escalationLevel: Int): List<User>

    @Modifying
    @Transactional
    @Query("""
        INSERT INTO users (id, clerk_id, name, email, created_at)
        VALUES (CAST(:id AS uuid), :clerkId, :name, :email, NOW())
        ON CONFLICT (clerk_id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email
    """, nativeQuery = true)
    fun upsertByClerkId(
        @Param("id") id: String,
        @Param("clerkId") clerkId: String,
        @Param("name") name: String,
        @Param("email") email: String
    )
}
