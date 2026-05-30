package com.ollia.saiae.composer

import com.ollia.entity.RiskLevel
import com.fasterxml.jackson.databind.ObjectMapper
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaePushLog
import com.ollia.entity.User
import com.ollia.repository.PushTokenRepository
import com.ollia.saiae.context.ContextResult
import com.ollia.saiae.repository.SaiaeCircleAlertCacheRepository
import com.ollia.saiae.repository.SaiaePushLogRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class CalmOutputComposerService(
    private val pushNotificationService: PushNotificationService,
    private val pushTokenRepository: PushTokenRepository,
    private val pushLogRepo: SaiaePushLogRepository,
    private val alertCacheRepo: SaiaeCircleAlertCacheRepository,
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
    private val objectMapper: ObjectMapper
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    private val warEvents = setOf(
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR
    )

    /**
     * Compose and cache the alert card for a member. Fire push if eligible
     * and dedup check passes.
     */
    @Transactional
    fun compose(
        watchedUser: User,       // the person whose status is being reported
        circleObserver: User,    // the family member receiving the alert
        event: NormalizedSafetyEvent,
        context: ContextResult,
        confidence: SaiaeConfidenceReport,
        sourceMatches: List<SaiaeEventSourceMatch>
    ) {
        val effectiveRisk = context.effectiveRisk
        val sentence = context.calmSentence

        // ─── Build card payload ───────────────────────────────────────────────
        val sourceList = buildSourceList(sourceMatches)
        val actionLabel = actionLabel(effectiveRisk, event.category, watchedUser.name)
        val footer = buildFooter(sourceList)

        val card = mapOf(
            "riskLevel"       to effectiveRisk.name,
            "floorApplied"    to context.floorApplied,
            "eventLabel"      to eventLabel(event.category),
            "confidenceTier"  to confidence.tier,
            "confidenceScore" to confidence.score,
            "sentence"        to sentence,
            "sources"         to sourceList,
            "conflictNote"    to buildConflictNote(confidence),
            "actionLabel"     to actionLabel,
            "footer"          to footer
        )

        // ─── Build push payload (null if not push eligible) ───────────────────
        val push: Map<String, String>? = if (context.pushEligible) {
            val title = truncate("${watchedUser.name} — ${eventLabel(event.category)}", 50)
            val body  = truncate(sentence, 100)
            val sound = if (effectiveRisk == RiskLevel.IMPORTANT_DISRUPTION) "alert" else "default"
            mapOf("title" to title, "body" to body, "sound" to sound)
        } else null

        // ─── Upsert cache ─────────────────────────────────────────────────────
        alertCacheRepo.upsert(
            eventId  = event.id!!,
            userId   = circleObserver.id!!,
            risk     = effectiveRisk.name,
            floor    = context.floorApplied,
            cardJson = objectMapper.writeValueAsString(card),
            pushJson = push?.let { objectMapper.writeValueAsString(it) }
        )

        // ─── Push deduplication + send ────────────────────────────────────────
        if (context.pushEligible && push != null) {
            tryFirePush(
                observer      = circleObserver,
                event         = event,
                context       = context,
                confidence    = confidence,
                pushTitle     = push["title"]!!,
                pushBody      = push["body"]!!
            )
        }
    }

    private fun tryFirePush(
        observer: User,
        event: NormalizedSafetyEvent,
        context: ContextResult,
        confidence: SaiaeConfidenceReport,
        pushTitle: String,
        pushBody: String
    ) {
        val token = pushTokenRepository.findByUserId(observer.id!!) ?: return
        val city = event.city ?: event.country
        val since = Instant.now().minus(6, ChronoUnit.HOURS)
        val lastPush = pushLogRepo.findLatestInWindow(
            userId    = observer.id,
            eventType = event.category.name,
            city      = city,
            since     = since
        )

        val shouldSend = lastPush == null || shouldEscalate(lastPush, context, confidence)
        if (!shouldSend) {
            logger.debug("Push suppressed (dedup) for user ${observer.id} event ${event.id}")
            return
        }

        val sound = if (context.effectiveRisk == RiskLevel.IMPORTANT_DISRUPTION) "alert" else "default"
        pushNotificationService.sendPushNotification(
            expoPushToken    = token.token,
            title            = pushTitle,
            body             = pushBody,
            categoryId       = "SAFETY_ALERT",
            userId           = observer.id,
            notificationType = "saiae_${event.category.name.lowercase()}"
        )

        pushLogRepo.save(SaiaePushLog(
            userId = observer.id,
            eventType = event.category.name,
            city = city,
            riskLevelAtSend = context.effectiveRisk.name,
            confidenceAtSend = confidence.score,
            userStatusAtSend = context.userStatus.name
        )
        )

        logger.info("Push sent to observer ${observer.id} for event ${event.id} (${event.category})")
    }

    /**
     * Returns true if a new push should fire despite being within the 6h window.
     * Escalation conditions:
     *  1. Risk level increased
     *  2. User became SILENT since last push
     *  3. Confidence tier improved (e.g. LOW → MODERATE)
     */
    private fun shouldEscalate(
        last: SaiaePushLog,
        context: ContextResult,
        confidence: SaiaeConfidenceReport
    ): Boolean {
        val riskIncreased = riskOrdinal(context.effectiveRisk.name) > riskOrdinal(last.riskLevelAtSend)
        val becameSilent  = context.userStatus.name == "SILENT" && last.userStatusAtSend != "SILENT"
        val tierImproved  = tierOrdinal(confidence.tier) > tierOrdinal(last.confidenceAtSend)
        return riskIncreased || becameSilent || tierImproved
    }

    private fun riskOrdinal(level: String) = when (level) {
        "IMPORTANT_DISRUPTION" -> 2; "STAY_AWARE" -> 1; else -> 0
    }
    private fun tierOrdinal(tier: String) = when (tier) {
        "HIGH" -> 3; "MODERATE" -> 2; "LOW" -> 1; else -> 0
    }
    private fun tierOrdinal(score: Int) = when {
        score >= 75 -> 3; score >= 50 -> 2; score >= 40 -> 1; else -> 0
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun eventLabel(cat: SafetyCategory): String = when (cat) {
        SafetyCategory.MISSILE_ATTACK    -> "Missile Attack"
        SafetyCategory.ARMED_CONFLICT    -> "Armed Conflict"
        SafetyCategory.WAR               -> "Armed Conflict"
        SafetyCategory.TERRORISM         -> "Security Incident"
        SafetyCategory.EXPLOSION         -> "Explosion"
        SafetyCategory.ACTIVE_SHOOTER    -> "Active Shooter"
        SafetyCategory.VIOLENCE          -> "Security Incident"
        SafetyCategory.PROTEST           -> "Protest Activity"
        SafetyCategory.RIOT              -> "Riot"
        SafetyCategory.CIVIL_UNREST      -> "Civil Unrest"
        SafetyCategory.CURFEW            -> "Curfew"
        SafetyCategory.EARTHQUAKE        -> "Earthquake"
        SafetyCategory.FLOOD             -> "Flood"
        SafetyCategory.WILDFIRE          -> "Wildfire"
        SafetyCategory.HURRICANE        -> "Hurricane"
        SafetyCategory.TORNADO           -> "Tornado"
        SafetyCategory.EXTREME_WEATHER   -> "Severe Weather"
        SafetyCategory.TSUNAMI           -> "Tsunami"
        SafetyCategory.VOLCANO           -> "Volcanic Activity"
        SafetyCategory.TRANSPORT_DISRUPTION -> "Transport Disruption"
        SafetyCategory.BLACKOUT          -> "Power Outage"
        SafetyCategory.INTERNET_OUTAGE   -> "Internet Outage"
        SafetyCategory.AIRPORT_DISRUPTION -> "Airport Disruption"
        SafetyCategory.HEALTH_ALERT      -> "Health Emergency"
        SafetyCategory.EPIDEMIC          -> "Epidemic Alert"
        SafetyCategory.PANDEMIC          -> "Pandemic Alert"
        SafetyCategory.BORDER_TENSION    -> "Border Closure"
        else                             -> "Safety Alert"
    }

    private fun actionLabel(risk: RiskLevel, cat: SafetyCategory, personName: String): String? = when {
        risk == RiskLevel.NORMAL                 -> null
        risk == RiskLevel.IMPORTANT_DISRUPTION   -> "Message $personName"
        cat in warEvents                         -> "Message $personName"
        else                                     -> "Got it"
    }

    private fun buildSourceList(matches: List<SaiaeEventSourceMatch>): List<Map<String, String?>> {
        val registry = sourceRegistryRepo.findAll().associateBy { it.id }
        return matches.map { match ->
            val src    = registry[match.sourceId]
            val origin = match.originSourceId?.let { registry[it] }
            mapOf(
                "name"         to (src?.name ?: match.sourceId),
                "tier"         to src?.tier?.toString(),
                "originSource" to origin?.name  // null = original, set = echo
            )
        }
    }

    private fun buildConflictNote(confidence: SaiaeConfidenceReport): String? = when (confidence.conflictType) {
        "EXISTENCE" -> "⚠ Conflicting reports — sources disagree on whether this event occurred."
        "DETAIL"    -> "Some details disputed — casualty count or timing may vary across sources."
        else        -> null
    }

    private fun buildFooter(sources: List<Map<String, String?>>): String {
        val names = sources.filter { it["originSource"] == null }.mapNotNull { it["name"] }.joinToString(", ")
        return "Sources: $names · Ollia surfaces alerts, does not assert outcomes."
    }

    private fun truncate(s: String, max: Int) = if (s.length > max) s.take(max - 1) + "…" else s
}