package com.ollia.repository

import com.ollia.entity.NotificationLog
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface NotificationLogRepository : JpaRepository<NotificationLog, UUID> {
    fun findAllByUserIdOrderBySentAtDesc(userId: UUID): List<NotificationLog>
    fun findAllByOrderBySentAtDesc(): List<NotificationLog>
    fun findAllByNotificationTypeOrderBySentAtDesc(notificationType: String): List<NotificationLog>
    fun findAllBySentAtAfterOrderBySentAtDesc(since: Instant): List<NotificationLog>
}