package com.ollia.controller

import com.ollia.dto.CheckoutRequest
import com.ollia.dto.CheckoutResponse
import com.ollia.dto.SubscriptionStatusResponse
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.UserRepository
import com.ollia.service.CurrentUserService
import com.fasterxml.jackson.databind.ObjectMapper
import com.stripe.Stripe
import com.stripe.model.Customer
import com.stripe.model.Event
import com.stripe.model.checkout.Session
import com.stripe.net.Webhook
import com.stripe.param.CustomerCreateParams
import com.stripe.param.checkout.SessionCreateParams
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus

@RestController
@RequestMapping("/api/subscriptions")
class SubscriptionController(
    @Value("\${stripe.secret-key:}") private val stripeSecretKey: String,
    @Value("\${stripe.price-id:}") private val monthlyPriceId: String,
    @Value("\${stripe.annual-price-id:}") private val annualPriceId: String,
    @Value("\${stripe.webhook-secret:}") private val webhookSecret: String,
    private val currentUserService: CurrentUserService,
    private val userRepository: UserRepository,
    private val familyCircleRepository: FamilyCircleRepository,
    private val objectMapper: ObjectMapper,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    // ─── POST /api/subscriptions/checkout ─── create Stripe checkout session
    @PostMapping("/checkout")
    fun createCheckout(@RequestBody request: CheckoutRequest): CheckoutResponse {
        if (stripeSecretKey.isBlank()) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Stripe not configured")
        }
        Stripe.apiKey = stripeSecretKey

        val user = currentUserService.getCurrentUser()

        // Get or create Stripe customer
        val customerId = if (!user.stripeCustomerId.isNullOrBlank()) {
            user.stripeCustomerId!!
        } else {
            val customer = Customer.create(
                CustomerCreateParams.builder()
                    .setEmail(user.email)
                    .putMetadata("userId", user.id.toString())
                    .build()
            )
            user.stripeCustomerId = customer.id
            userRepository.save(user)
            customer.id
        }

        val priceId = if (request.plan == "annual") annualPriceId else monthlyPriceId
        if (priceId.isBlank()) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Stripe price not configured")
        }

        val params = SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
            .setCustomer(customerId)
            .setSuccessUrl("ollia://premium-success")
            .setCancelUrl("ollia://premium-cancel")
            .putMetadata("userId", user.id.toString())
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setPrice(priceId)
                    .setQuantity(1)
                    .build()
            )
            .build()

        val session = Session.create(params)
        return CheckoutResponse(url = session.url)
    }

    // ─── POST /api/subscriptions/webhook ─── Stripe webhook handler
    @PostMapping("/webhook", consumes = ["*/*"])
    fun handleWebhook(
        @RequestBody payload: ByteArray,
        @RequestHeader("Stripe-Signature", required = false) sigHeader: String?
    ): ResponseEntity<Map<String, Any>> {
        val payloadStr = String(payload, Charsets.UTF_8)

        val event: Event = try {
            if (!sigHeader.isNullOrBlank() && webhookSecret.isNotBlank()) {
                Webhook.constructEvent(payloadStr, sigHeader, webhookSecret)
            } else {
                // Dev mode: parse without signature verification
                if (stripeSecretKey.isNotBlank()) Stripe.apiKey = stripeSecretKey
                Event.PRETTY_PRINT_GSON.fromJson(payloadStr, Event::class.java)
            }
        } catch (e: Exception) {
            logger.warn("Webhook signature verification failed: ${e.message}")
            return ResponseEntity.badRequest().body(mapOf("error" to (e.message ?: "invalid signature")))
        }

        logger.info("Stripe webhook: ${event.type}")

        val eventJson = objectMapper.readTree(payloadStr)
        val dataObj = eventJson.path("data").path("object")

        when (event.type) {
            "checkout.session.completed" -> {
                val customerId = dataObj.path("customer").asText(null)
                val subscriptionId = dataObj.path("subscription").asText(null)
                val userIdStr = dataObj.path("metadata").path("userId").asText(null)
                logger.info("checkout.session.completed: customerId=$customerId subscriptionId=$subscriptionId metadataUserId=$userIdStr")

                // Primary lookup by stripeCustomerId
                var user = customerId?.let { userRepository.findByStripeCustomerId(it) }

                // Fallback: use userId embedded in session metadata (no extra Stripe API call)
                if (user == null && userIdStr != null) {
                    logger.warn("checkout.session.completed: no user found for stripeCustomerId=$customerId — trying metadataUserId=$userIdStr")
                    user = runCatching { userRepository.findById(UUID.fromString(userIdStr)).orElse(null) }.getOrNull()
                    if (user != null && customerId != null) {
                        logger.info("checkout.session.completed: found user via metadata — backfilling stripeCustomerId")
                        user.stripeCustomerId = customerId
                    }
                }

                if (user == null) {
                    logger.error("checkout.session.completed: could not resolve user (customerId=$customerId metadataUserId=$userIdStr) — plan NOT updated")
                    return ResponseEntity.ok(mapOf("received" to true))
                }

                logger.info("checkout.session.completed: upgrading user clerkId=${user.clerkId} id=${user.id} to premium")
                user.plan = "premium"
                user.stripeSubscriptionId = subscriptionId
                userRepository.save(user)

                val circle = familyCircleRepository.findByOwnerId(user.id!!)
                if (circle == null) {
                    logger.warn("checkout.session.completed: no circle for ownerId=${user.id} — user upgraded but circle NOT updated")
                } else {
                    circle.plan = "premium"
                    familyCircleRepository.save(circle)
                    logger.info("checkout.session.completed: upgraded circle id=${circle.id} to premium")
                }
            }
            "customer.subscription.deleted" -> {
                val customerId = dataObj.path("customer").asText(null)
                logger.info("customer.subscription.deleted: customerId=$customerId")

                if (customerId == null) {
                    logger.warn("customer.subscription.deleted: event has no customerId, skipping")
                    return ResponseEntity.ok(mapOf("received" to true))
                }

                val user = userRepository.findByStripeCustomerId(customerId)
                if (user == null) {
                    logger.warn("customer.subscription.deleted: no user found for stripeCustomerId=$customerId — plan NOT updated")
                } else {
                    logger.info("customer.subscription.deleted: downgrading user clerkId=${user.clerkId} id=${user.id} to free")
                    user.plan = "free"
                    user.stripeSubscriptionId = null
                    userRepository.save(user)
                    val circle = familyCircleRepository.findByOwnerId(user.id!!)
                    if (circle == null) {
                        logger.warn("customer.subscription.deleted: no circle for ownerId=${user.id} — user downgraded but circle NOT updated")
                    } else {
                        circle.plan = "free"
                        familyCircleRepository.save(circle)
                        logger.info("customer.subscription.deleted: downgraded circle id=${circle.id} to free")
                    }
                }
            }
        }

        return ResponseEntity.ok(mapOf("received" to true))
    }

    // ─── GET /api/subscriptions/status ─── return current plan
    @GetMapping("/status")
    fun getStatus(): SubscriptionStatusResponse {
        val user = currentUserService.getCurrentUser()
        return SubscriptionStatusResponse(
            plan = user.effectivePlan(),
            subscriptionId = user.stripeSubscriptionId
        )
    }
}
