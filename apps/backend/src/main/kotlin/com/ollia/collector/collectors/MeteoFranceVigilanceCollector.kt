package com.ollia.collector.collectors

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.ollia.collector.SafetyCollector
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.repository.RawSafetySignalRepository
import com.ollia.util.HashUtils
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant
import java.time.LocalDate

/**
 * Official Météo-France departmental vigilance (DP Vigilance).
 *
 * Requires a free account + API key from https://portail-api.meteofrance.fr/
 * Subscribe to DonneesPubliquesVigilance, then set:
 *   METEO_FRANCE_API_KEY=<basic credentials or apikey from portal>
 *   ollia.collectors.meteofrance.enabled=true
 *
 * This is the depth path for Paris / France beyond MeteoAlarm Atom.
 */
@Component
@ConditionalOnProperty(
    prefix = "ollia.collectors.meteofrance",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = false
)
class MeteoFranceVigilanceCollector(
    private val objectMapper: ObjectMapper,
    private val repository: RawSafetySignalRepository,
    @Value("\${meteofrance.api-key:}") private val apiKey: String,
) : SafetyCollector {

    override val source = SourceType.METEO_FRANCE
    private val logger = LoggerFactory.getLogger(javaClass)

    private val webClient = WebClient.builder()
        .codecs { it.defaultCodecs().maxInMemorySize(8 * 1024 * 1024) }
        .build()

    override fun collect(): List<RawSafetyEvent> {
        if (apiKey.isBlank()) {
            logger.warn("Météo-France enabled but meteofrance.api-key is blank — skipping")
            return emptyList()
        }
        val token = fetchToken() ?: return emptyList()
        val map = fetchVigilanceMap(token) ?: return emptyList()
        val now = Instant.now()
        val day = LocalDate.now().toString()
        val collected = mutableListOf<RawSafetyEvent>()

        // Product schema varies; walk common vigilance color fields aggressively.
        collectFromTree(map, day, now, collected)
        logger.info("Météo-France vigilance fetched ${collected.size} signals")
        return collected
    }

    private fun fetchToken(): String? {
        return try {
            val body = webClient.post()
                .uri("https://portail-api.meteofrance.fr/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .header("Authorization", "Basic $apiKey")
                .bodyValue("grant_type=client_credentials")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
            body?.get("access_token")?.asText()
        } catch (e: Exception) {
            logger.warn("Météo-France token failed: ${e.message}")
            null
        }
    }

    private fun fetchVigilanceMap(token: String): JsonNode? {
        return try {
            webClient.get()
                .uri("https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours")
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("Météo-France vigilance map failed: ${e.message}")
            null
        }
    }

    private fun collectFromTree(
        node: JsonNode,
        day: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>,
    ) {
        when {
            node.isObject -> {
                val color = node.path("color_id").asText(null)
                    ?: node.path("color").asText(null)
                    ?: node.path("vigilance_color").asText(null)
                val dep = node.path("domain_id").asText(null)
                    ?: node.path("department").asText(null)
                    ?: node.path("dep").asText(null)
                val phenom = node.path("phenomenon_id").asText(null)
                    ?: node.path("phenomenon").asText(null)
                    ?: node.path("risk_name").asText(null)

                if (color != null && isActionableColor(color)) {
                    addSignal(dep, phenom, color, day, now, node, collected)
                }
                node.fields().forEachRemaining { (_, child) -> collectFromTree(child, day, now, collected) }
            }
            node.isArray -> node.forEach { collectFromTree(it, day, now, collected) }
        }
    }

    private fun isActionableColor(color: String): Boolean {
        val c = color.lowercase()
        // 1=green, 2=yellow, 3=orange, 4=red (ids vary by product version)
        return c in setOf("3", "4", "orange", "red", "rouge", "jaune") &&
            c !in setOf("1", "green", "vert")
    }

    private fun addSignal(
        dep: String?,
        phenom: String?,
        color: String,
        day: String,
        now: Instant,
        payload: JsonNode,
        collected: MutableList<RawSafetyEvent>,
    ) {
        val colorNorm = color.lowercase()
        // Skip pure yellow unless phenomenon is flood/storm — still surface orange+
        if (colorNorm in setOf("2", "jaune", "yellow") &&
            phenom?.contains("inond", ignoreCase = true) != true &&
            phenom?.contains("orage", ignoreCase = true) != true &&
            phenom?.contains("vent", ignoreCase = true) != true
        ) return

        val externalId = "mf:$day:${dep ?: "fr"}:${phenom ?: color}:$colorNorm"
        if (repository.existsBySourceAndExternalId(source, externalId)) return
        if (collected.any { it.externalId == externalId }) return

        val severity = when {
            colorNorm in setOf("4", "red", "rouge") -> Severity.CRITICAL
            colorNorm in setOf("3", "orange") -> Severity.HIGH
            else -> Severity.MEDIUM
        }
        val category = when {
            phenom?.contains("inond", ignoreCase = true) == true ||
                phenom?.contains("pluie", ignoreCase = true) == true -> SafetyCategory.FLOOD
            phenom?.contains("feu", ignoreCase = true) == true -> SafetyCategory.WILDFIRE
            else -> SafetyCategory.EXTREME_WEATHER
        }
        val title = buildString {
            append("Météo-France vigilance")
            if (!dep.isNullOrBlank()) append(" · dép. $dep")
            if (!phenom.isNullOrBlank()) append(" · $phenom")
            append(" ($color)")
        }
        val payloadNode: ObjectNode = objectMapper.createObjectNode().apply {
            put("department", dep)
            put("phenomenon", phenom)
            put("color", color)
            set<JsonNode>("raw", payload)
        }
        val contentHash = HashUtils.sha256(externalId)
        collected.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = title.take(1000),
                description = "Official Météo-France departmental vigilance ($color).",
                sourceUrl = "https://vigilance.meteofrance.fr/",
                country = "France",
                city = null,
                latitude = null,
                longitude = null,
                eventOccurredAt = now,
                collectedAt = now,
                category = category,
                severityHint = severity,
                language = "fr",
                contentHash = contentHash,
                rawPayload = payloadNode,
            )
        )
    }
}
