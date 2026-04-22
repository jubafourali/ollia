package com.ollia.controller

import com.fasterxml.jackson.databind.JsonNode
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/subscriptions/revenuecat-webhook")
class RevenueCatWebhookController(
    @Value("\${revenuecat.webhook-secret:}") private val webhookSecret: String,
    private val userRepository: UserRepository,
    private val familyCircleRepository: FamilyCircleRepository,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @PostMapping(consumes = ["*/*"])
    fun handleWebhook(
        @RequestBody body: JsonNode,
        @RequestHeader("Authorization", required = false) authHeader: String?
    ): ResponseEntity<Map<String, Any>> {
        // Verify shared secret
        if (webhookSecret.isNotBlank()) {
            val token = authHeader?.removePrefix("Bearer ")?.trim()
            if (token != webhookSecret) {
                logger.warn("RevenueCat webhook: invalid secret")
                return ResponseEntity.status(401).body(mapOf("error" to "unauthorized"))
            }
        }

        val event = body.path("event")
        val eventType = event.path("type").asText("")
        val appUserId = event.path("app_user_id").asText(null)

        logger.info("RevenueCat webhook: type=$eventType appUserId=$appUserId")

        if (appUserId == null) {
            return ResponseEntity.ok(mapOf("received" to true))
        }

        // appUserId is the Clerk user ID we set when configuring RevenueCat
        val user = userRepository.findByClerkId(appUserId)
        if (user == null) {
            logger.warn("RevenueCat webhook: no user found for appUserId=$appUserId")
            return ResponseEntity.ok(mapOf("received" to true))
        }

        when (eventType) {
            "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION" -> {
                user.plan = "premium"
                userRepository.save(user)
                familyCircleRepository.findByOwnerId(user.id!!)?.let {
                    it.plan = "premium"
                    familyCircleRepository.save(it)
                }
                logger.info("RevenueCat: upgraded user ${user.clerkId} to premium")
            }
            "CANCELLATION", "EXPIRATION", "BILLING_ISSUE" -> {
                user.plan = "free"
                userRepository.save(user)
                familyCircleRepository.findByOwnerId(user.id!!)?.let {
                    it.plan = "free"
                    familyCircleRepository.save(it)
                }
                logger.info("RevenueCat: downgraded user ${user.clerkId} to free")
            }
        }

        return ResponseEntity.ok(mapOf("received" to true))
    }
}