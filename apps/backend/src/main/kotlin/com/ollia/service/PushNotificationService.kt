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

    fun sendPushNotification(expoPushToken: String, title: String, body: String, categoryId: String? = null) {
        try {
            val data = buildMap<String, String> {
                put("type", "checkin")
                if (categoryId != null) put("categoryId", categoryId)
            }
            webClient.post()
                .bodyValue(mapOf(
                    "to" to expoPushToken,
                    "sound" to "default",
                    "title" to title,
                    "body" to body,
                    "data" to data,
                    "categoryIdentifier" to categoryId,  // belt-and-suspenders for iOS
                ).filterValues { it != null })
                .retrieve()
                .bodyToMono(String::class.java)
                .block()
            logger.info("Push notification sent to $expoPushToken (category=$categoryId)")
        } catch (e: Exception) {
            logger.error("Failed to send push notification to $expoPushToken", e)
        }
    }
}
