package com.ollia.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "notification_log")
class NotificationLog(
    @Id
    var id: UUID = UUID.randomUUID(),

    @Column(name = "user_id")
    var userId: UUID? = null,

    @Column(name = "expo_push_token", nullable = false)
    var expoPushToken: String = "",

    @Column(nullable = false)
    var title: String = "",

    @Column(nullable = false)
    var body: String = "",

    @Column(name = "category_id")
    var categoryId: String? = null,

    @Column(name = "notification_type", nullable = false)
    var notificationType: String = "",

    @Column(nullable = false)
    var status: String = "sent",

    @Column(name = "error_message")
    var errorMessage: String? = null,

    @CreationTimestamp
    @Column(name = "sent_at", nullable = false, updatable = false)
    var sentAt: Instant = Instant.now()
)