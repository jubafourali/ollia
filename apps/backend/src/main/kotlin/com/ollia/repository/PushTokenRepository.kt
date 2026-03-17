package com.ollia.repository

import com.ollia.entity.PushToken
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PushTokenRepository : JpaRepository<PushToken, UUID> {
    fun findByUserId(userId: UUID): PushToken?
    fun findAllByUserIdIn(userIds: List<UUID>): List<PushToken>
    fun deleteAllByUserId(userId: UUID)
}
