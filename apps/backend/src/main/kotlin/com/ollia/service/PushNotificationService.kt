package com.ollia.service

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient

@Service
class PushNotificationService {

    private val logger = LoggerFactory.getLogger(javaClass)
    private val webClient = WebClient.builder()
        .baseUrl("https://exp.host/--/api/v2/push/send")
        .build()

    fun sendPushNotification(
        expoPushToken: String,
        title: String,
        body: String,
        categoryId: String? = null
    ) {
        try {
            // Expo's push API forwards top-level `categoryId` to the APNs
            // `category` field, which is what iOS uses to look up the
            // notification category + action buttons registered on-device.
            // See: https://docs.expo.dev/push-notifications/sending-notifications/
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
            logger.info("Push notification sent to $expoPushToken (category=$categoryId)")
        } catch (e: Exception) {
            logger.error("Failed to send push notification to $expoPushToken", e)
        }
    }
}