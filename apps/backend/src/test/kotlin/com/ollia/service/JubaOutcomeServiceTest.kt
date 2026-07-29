package com.ollia.service

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import org.springframework.web.reactive.function.client.WebClient

class JubaOutcomeServiceTest {
    @Test
    fun `customer acquisition payload is stable scoped and free of user PII`() {
        val service =
            JubaOutcomeService(
                endpoint = "https://app.getjuba.com/api/analytics/events",
                ingestKey = "test-key",
                sourceId = "analytics-ollia-http",
                eventName = "customer_acquired",
                campaignId = "campaign-123",
                experimentId = "experiment-456",
                webClientBuilder = WebClient.builder(),
            )
        val occurredAt = Instant.parse("2026-07-29T04:00:00Z")

        val payload =
            service.customerAcquiredPayload(
                externalId = "stripe:evt_123",
                actorId = "user-456",
                occurredAt = occurredAt,
                sourceEvent = "stripe.checkout.session.completed",
            )
        val event = (payload["events"] as List<*>).single() as Map<*, *>
        val properties = event["properties"] as Map<*, *>

        assertEquals("analytics-ollia-http", payload["sourceId"])
        assertEquals("customer_acquired", event["eventName"])
        assertEquals("stripe:evt_123", event["externalId"])
        assertEquals("user-456", event["actorId"])
        assertEquals("2026-07-29T04:00:00Z", event["occurredAt"])
        assertEquals("campaign-123", properties["campaignId"])
        assertEquals("experiment-456", properties["experimentId"])
        assertEquals(
            "stripe.checkout.session.completed",
            properties["sourceEvent"],
        )
    }
}
