package com.ollia.controller

import com.ollia.dto.CheckoutRequest
import com.ollia.dto.CheckoutResponse
import com.ollia.dto.SubscriptionStatusResponse
import com.ollia.repository.FamilyCircleRepository
import com.ollia.repository.UserRepository
import com.ollia.service.CurrentUserService
import com.stripe.Stripe
import com.stripe.model.Customer
import com.stripe.model.Event
import com.stripe.model.Subscription
import com.stripe.model.checkout.Session
import com.stripe.net.Webhook
import com.stripe.param.CustomerCreateParams
import com.stripe.param.checkout.SessionCreateParams
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
    private val familyCircleRepository: FamilyCircleRepository
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
            .setSuccessUrl("ollia://checkout-complete?success=true")
            .setCancelUrl("ollia://checkout-complete?cancelled=true")
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

        when (event.type) {
            "checkout.session.completed" -> {
                val session = event.dataObjectDeserializer.`object`.orElse(null) as? Session
                val customerId = session?.customer
                val subscriptionId = session?.subscription
                if (customerId != null) {
                    userRepository.findByStripeCustomerId(customerId)?.let { user ->
                        user.plan = "premium"
                        user.stripeSubscriptionId = subscriptionId
                        userRepository.save(user)
                        familyCircleRepository.findByOwnerId(user.id!!)?.let { circle ->
                            circle.plan = "premium"
                            familyCircleRepository.save(circle)
                        }
                        logger.info("Upgraded user ${user.clerkId} to premium")
                    }
                }
            }
            "customer.subscription.deleted" -> {
                val subscription = event.dataObjectDeserializer.`object`.orElse(null) as? Subscription
                val customerId = subscription?.customer
                if (customerId != null) {
                    userRepository.findByStripeCustomerId(customerId)?.let { user ->
                        user.plan = "free"
                        user.stripeSubscriptionId = null
                        userRepository.save(user)
                        familyCircleRepository.findByOwnerId(user.id!!)?.let { circle ->
                            circle.plan = "free"
                            familyCircleRepository.save(circle)
                        }
                        logger.info("Downgraded user ${user.clerkId} to free")
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
            plan = user.plan,
            subscriptionId = user.stripeSubscriptionId
        )
    }
}
