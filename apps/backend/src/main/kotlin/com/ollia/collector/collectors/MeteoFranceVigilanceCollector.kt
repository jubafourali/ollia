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
 * Official Météo-France departmental vigilance (DP Vigilance V6 carte).
 *
 * Portal JWT (eyJ…) or Base64 OAuth credentials:
 *   METEO_FRANCE_API_KEY=…
 *   OLLIA_COLLECTORS_METEOFRANCE_ENABLED=true
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
        val map = fetchVigilanceMap() ?: return emptyList()
        val now = Instant.now()
        val day = LocalDate.now().toString()
        val collected = mutableListOf<RawSafetyEvent>()
        parseV6Carte(map, day, now, collected)
        logger.info("Météo-France vigilance fetched ${collected.size} signals")
        return collected
    }

    private fun resolveBearer(): String? {
        val trimmed = apiKey.trim()
        if (trimmed.startsWith("eyJ")) return trimmed
        return fetchOauthToken(trimmed)
    }

    private fun fetchOauthToken(basicCredentials: String): String? {
        return try {
            val body = webClient.post()
                .uri("https://portail-api.meteofrance.fr/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .header("Authorization", "Basic $basicCredentials")
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

    private fun fetchVigilanceMap(): JsonNode? {
        val bearer = resolveBearer() ?: return null
        return try {
            webClient.get()
                .uri("https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours")
                .header("Authorization", "Bearer $bearer")
                .header("apikey", bearer)
                .header("Accept", "application/json")
                .retrieve()
                .bodyToMono(JsonNode::class.java)
                .block()
        } catch (e: Exception) {
            logger.warn("Météo-France vigilance map failed: ${e.message}")
            null
        }
    }

    /** Parse DP Vigilance carte V6: periods → timelaps → domain_ids → phenomenon_items → timelaps_items. */
    private fun parseV6Carte(
        root: JsonNode,
        day: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>,
    ) {
        val periods = root.path("product").path("periods")
        if (!periods.isArray) {
            logger.warn("Météo-France: unexpected schema (no product.periods)")
            return
        }
        for (period in periods) {
            val echeance = period.path("echeance").asText("J")
            val domains = period.path("timelaps").path("domain_ids")
            if (!domains.isArray) continue
            for (domain in domains) {
                val dep = domain.path("domain_id").asText(null) ?: continue
                // Skip national FRA aggregate — emit department rows (geo matches Paris via country).
                if (dep.equals("FRA", ignoreCase = true)) continue
                val phenomena = domain.path("phenomenon_items")
                if (!phenomena.isArray) continue
                for (phen in phenomena) {
                    val phenomId = phen.path("phenomenon_id").asText(null) ?: continue
                    val maxColor = colorInt(phen.path("phenomenon_max_color_id"))
                        ?: phen.path("timelaps_items").maxOfOrNull { colorInt(it.path("color_id")) ?: 0 }
                        ?: 0
                    if (maxColor < 3) continue // orange+ only
                    addSignal(
                        dep = dep,
                        phenomId = phenomId,
                        color = maxColor,
                        echeance = echeance,
                        day = day,
                        now = now,
                        collected = collected,
                    )
                }
            }
        }
    }

    private fun colorInt(node: JsonNode): Int? {
        if (node.isMissingNode || node.isNull) return null
        return when {
            node.isInt || node.isLong || node.isNumber -> node.asInt()
            else -> node.asText().toIntOrNull()
        }
    }

    private fun addSignal(
        dep: String,
        phenomId: String,
        color: Int,
        echeance: String,
        day: String,
        now: Instant,
        collected: MutableList<RawSafetyEvent>,
    ) {
        val phenomName = PHENOMENA[phenomId] ?: "phénomène $phenomId"
        val colorName = if (color >= 4) "rouge" else "orange"
        val externalId = "mf:$day:$dep:$phenomId:$color:$echeance"
        if (repository.existsBySourceAndExternalId(source, externalId)) return
        if (collected.any { it.externalId == externalId }) return

        val severity = if (color >= 4) Severity.CRITICAL else Severity.HIGH
        val category = when (phenomId) {
            "1", "2" -> SafetyCategory.FLOOD          // vent violent / pluie-inondation
            "3" -> SafetyCategory.EXTREME_WEATHER     // orages
            "4" -> SafetyCategory.EXTREME_WEATHER     // inondation
            "5" -> SafetyCategory.EXTREME_WEATHER     // neige-verglas
            "6" -> SafetyCategory.EXTREME_WEATHER     // canicule
            "7" -> SafetyCategory.EXTREME_WEATHER     // grand froid
            "8" -> SafetyCategory.EXTREME_WEATHER     // avalanches
            "9" -> SafetyCategory.EXTREME_WEATHER     // vagues-submersion
            else -> SafetyCategory.EXTREME_WEATHER
        }
        // Prefer flood category for rain/flood codes
        val finalCategory = when (phenomId) {
            "2", "4" -> SafetyCategory.FLOOD
            else -> category
        }

        val coords = DEPT_COORDS[dep.padStart(2, '0')] ?: DEPT_COORDS[dep]
        val title = "Vigilance $colorName · $phenomName · dép. $dep"
        val payloadNode: ObjectNode = objectMapper.createObjectNode().apply {
            put("department", dep)
            put("phenomenon_id", phenomId)
            put("phenomenon", phenomName)
            put("color_id", color)
            put("color", colorName)
            put("echeance", echeance)
        }
        collected.add(
            RawSafetyEvent(
                source = source,
                externalId = externalId,
                title = title.take(1000),
                description = "Vigilance Météo-France $colorName pour $phenomName (département $dep, échéance $echeance).",
                sourceUrl = "https://vigilance.meteofrance.fr/",
                country = "France",
                city = DEPT_CITY[dep.padStart(2, '0')] ?: DEPT_CITY[dep],
                latitude = coords?.first,
                longitude = coords?.second,
                eventOccurredAt = now,
                collectedAt = now,
                category = finalCategory,
                severityHint = severity,
                language = "fr",
                contentHash = HashUtils.sha256(externalId),
                rawPayload = payloadNode,
            )
        )
    }

    companion object {
        /** Official phenomenon ids (Vigilance V6). */
        private val PHENOMENA = mapOf(
            "1" to "vent violent",
            "2" to "pluie-inondation",
            "3" to "orages",
            "4" to "inondation",
            "5" to "neige-verglas",
            "6" to "canicule",
            "7" to "grand froid",
            "8" to "avalanches",
            "9" to "vagues-submersion",
        )

        /** Prefects / major cities for geo matching (ICP-relevant + large deps). */
        private val DEPT_CITY = mapOf(
            "75" to "Paris", "92" to "Paris", "93" to "Paris", "94" to "Paris",
            "78" to "Paris", "91" to "Paris", "95" to "Paris", "77" to "Paris",
            "69" to "Lyon", "13" to "Marseille", "06" to "Nice", "31" to "Toulouse",
            "33" to "Bordeaux", "44" to "Nantes", "67" to "Strasbourg", "34" to "Montpellier",
            "59" to "Lille", "35" to "Rennes",
        )

        private val DEPT_COORDS = mapOf(
            "75" to (48.86 to 2.35), "92" to (48.89 to 2.24), "93" to (48.91 to 2.45),
            "94" to (48.79 to 2.46), "78" to (48.80 to 2.13), "91" to (48.52 to 2.25),
            "95" to (49.03 to 2.07), "77" to (48.61 to 2.88),
            "69" to (45.76 to 4.84), "13" to (43.30 to 5.40), "06" to (43.70 to 7.25),
            "31" to (43.60 to 1.44), "33" to (44.84 to -0.58), "44" to (47.22 to -1.55),
            "67" to (48.57 to 7.75), "34" to (43.61 to 3.88), "59" to (50.63 to 3.06),
            "35" to (48.11 to -1.68),
        )
    }
}
