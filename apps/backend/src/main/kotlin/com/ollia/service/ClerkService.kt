package com.ollia.service

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatusCode
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.web.reactive.function.client.WebClient

@Service
class ClerkService(
    @Value("\${clerk.secret-key}") private val secretKey: String
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .baseUrl("https://api.clerk.com/v1")
        .defaultHeader("Authorization", "Bearer $secretKey")
        .build()

    @Async
    fun deleteUserAsync(clerkId: String) {
        try {
            logger.info("Deleting Clerk user {}", clerkId)
            webClient.delete()
                .uri("/users/{clerkId}", clerkId)
                .retrieve()
                .onStatus(HttpStatusCode::isError) { response ->
                    response.bodyToMono(String::class.java).map { body ->
                        RuntimeException("Clerk API error ${response.statusCode()}: $body")
                    }
                }
                .toBodilessEntity()
                .block()
            logger.info("Clerk user {} deleted successfully", clerkId)
        } catch (e: Exception) {
            logger.error("Failed to delete Clerk user {}: {}", clerkId, e.message)
        }
    }
}
