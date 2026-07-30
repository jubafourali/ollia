package com.ollia.service

import java.time.Duration
import java.time.Instant
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Mono

@Service
class JubaOutcomeService(
    @Value("\${juba.outcomes.endpoint:https://app.getjuba.com/api/analytics/events}")
    private val endpoint: String,
    @Value("\${juba.outcomes.ingest-key:}") private val ingestKey: String,
    @Value("\${juba.outcomes.source-id:}") private val sourceId: String,
    @Value("\${juba.outcomes.event-name:customer_acquired}") private val eventName: String,
    @Value("\${juba.outcomes.campaign-id:}") private val campaignId: String,
    @Value("\${juba.outcomes.experiment-id:}") private val experimentId: String,
    private val webClientBuilder: WebClient.Builder,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    fun recordCustomerAcquired(
        externalId: String,
        actorId: String,
        occurredAt: Instant,
        sourceEvent: String,
    ) {
        if (!isConfigured()) {
            logger.debug("Juba outcome delivery is not configured; skipping {}", sourceEvent)
            return
        }
        if (externalId.isBlank() || actorId.isBlank()) {
            logger.warn("Juba outcome delivery skipped because its stable identity is missing")
            return
        }

        webClientBuilder
            .build()
            .post()
            .uri(endpoint)
            .header("Authorization", "Bearer $ingestKey")
            .bodyValue(
                customerAcquiredPayload(
                    externalId = externalId,
                    actorId = actorId,
                    occurredAt = occurredAt,
                    sourceEvent = sourceEvent,
                ),
            )
            .retrieve()
            .toBodilessEntity()
            .timeout(Duration.ofSeconds(5))
            .doOnSuccess {
                logger.info(
                    "Delivered {} outcome to Juba for source event {}",
                    eventName,
                    sourceEvent,
                )
            }
            .doOnError { error ->
                logger.warn(
                    "Juba outcome delivery failed for {}: {}",
                    sourceEvent,
                    error.message,
                )
            }
            .onErrorResume { Mono.empty() }
            .subscribe()
    }

    internal fun customerAcquiredPayload(
        externalId: String,
        actorId: String,
        occurredAt: Instant,
        sourceEvent: String,
    ): Map<String, Any> =
        mapOf(
            "sourceId" to sourceId,
            "events" to
                listOf(
                    mapOf(
                        "eventName" to eventName,
                        "externalId" to externalId,
                        "actorId" to actorId,
                        "occurredAt" to occurredAt.toString(),
                        "properties" to
                            mapOf(
                                "sourceEvent" to sourceEvent,
                                "campaignId" to campaignId,
                                "experimentId" to experimentId,
                            ),
                    ),
                ),
        )

    private fun isConfigured() =
        endpoint.startsWith("https://") &&
            ingestKey.isNotBlank() &&
            sourceId.isNotBlank() &&
            campaignId.isNotBlank() &&
            experimentId.isNotBlank()
}
