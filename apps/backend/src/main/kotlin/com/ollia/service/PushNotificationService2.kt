package com.ollia.service

import com.ollia.entity.NotificationLog
import com.ollia.repository.NotificationLogRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import java.util.UUID

@Service
class PushNotificationService2(
    private val notificationLogRepository: NotificationLogRepository
) {

    private val logger = LoggerFactory.getLogger(javaClass)
    private val webClient = WebClient.builder()
        .baseUrl("https://exp.host/--/api/v2/push/send")
        .build()

    /**
     * Send an Expo push notification and persist a row to notification_log
     * regardless of outcome. The [notificationType] identifies the caller
     * (e.g. "nudge_first", "escalation_family") — used for admin filtering.
     */
    fun sendPushNotification(
        expoPushToken: String,
        title: String,
        body: String,
        categoryId: String? = null,
        userId: UUID? = null,
        notificationType: String = "generic"
    ) {
        var status = "sent"
        var errorMessage: String? = null

        try {
            // Expo forwards top-level `categoryId` to APNs `category`, which
            // is what iOS uses to look up on-device notification categories
            // (registered via Notifications.setNotificationCategoryAsync).
            val payload = buildMap<String, Any> {
                put("to", expoPushToken)
                put("sound", "default")
                put("title", title)
                put("body", body)
                put("data", mapOf("type" to "checkin"))
                if (categoryId != null) {
                    put("categoryId", categoryId)
                }
            }

            webClient.post()
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(String::class.java)
                .block()

            logger.info("Push sent to $expoPushToken (type=$notificationType, category=$categoryId)")
        } catch (e: Exception) {
            status = "failed"
            errorMessage = e.message?.take(500)
            logger.error("Failed to send push to $expoPushToken (type=$notificationType)", e)
        }

        // Always write a log row — success or failure
        try {
            notificationLogRepository.save(
                NotificationLog(
                    userId = userId,
                    expoPushToken = expoPushToken,
                    title = title,
                    body = body,
                    categoryId = categoryId,
                    notificationType = notificationType,
                    status = status,
                    errorMessage = errorMessage
                )
            )
        } catch (e: Exception) {
            logger.error("Failed to persist notification log entry", e)
        }
    }
}