package com.ollia.service

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatusCode
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant

/**
 * Server-side Juba ingest. Product analytics stay on PostHog (mobile);
 * Juba receives authoritative GTM outcomes only. Never call from the client —
 * the ingest key must stay server-only.
 */
@Service
class JubaAnalyticsClient(
    @Value("\${juba.ingest-key:}") private val ingestKey: String,
    @Value("\${juba.ingest-url}") private val ingestUrl: String,
    @Value("\${juba.source-id}") private val sourceId: String,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient: WebClient? =
        if (ingestKey.isBlank()) null
        else WebClient.builder().build()

    fun isEnabled(): Boolean = webClient != null

    /**
     * Fire-and-forget. Failures are logged and never thrown to callers.
     */
    @Async
    fun trackAsync(
        eventName: String,
        externalId: String,
        actorId: String,
        occurredAt: Instant = Instant.now(),
        properties: Map<String, Any?> = emptyMap(),
    ) {
        val client = webClient
        if (client == null) {
            return
        }

        val event = linkedMapOf<String, Any?>(
            "eventName" to eventName,
            "externalId" to externalId,
            "actorId" to actorId,
            "occurredAt" to occurredAt.toString(),
            "properties" to properties.filterValues { it != null },
        )

        val body = mapOf(
            "sourceId" to sourceId,
            "events" to listOf(event),
        )

        try {
            client.post()
                .uri(ingestUrl)
                .header("Authorization", "Bearer $ingestKey")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError) { response ->
                    response.bodyToMono(String::class.java).map { errBody ->
                        RuntimeException("Juba ingest error ${response.statusCode()}: $errBody")
                    }
                }
                .toBodilessEntity()
                .block()
            logger.info("Juba event sent: {} externalId={}", eventName, externalId)
        } catch (e: Exception) {
            logger.warn("Juba ingest failed for {}: {}", eventName, e.message)
        }
    }
}
