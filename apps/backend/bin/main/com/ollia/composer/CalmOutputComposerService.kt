package com.ollia.saiae.composer

import com.ollia.entity.RiskLevel
import com.fasterxml.jackson.databind.ObjectMapper
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.SaiaeConfidenceReport
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaePushLog
import com.ollia.entity.SaiaeSourceRegistry
import com.ollia.entity.User
import com.ollia.repository.PushTokenRepository
import com.ollia.saiae.context.ContextResult
import com.ollia.saiae.repository.SaiaeCircleAlertCacheRepository
import com.ollia.saiae.repository.SaiaePushLogRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

@Service
class CalmOutputComposerService(
    private val pushNotificationService: PushNotificationService,
    private val pushTokenRepository: PushTokenRepository,
    private val pushLogRepo: SaiaePushLogRepository,
    private val alertCacheRepo: SaiaeCircleAlertCacheRepository,
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
        sourceMatches: List<SaiaeEventSourceMatch>,
        registry: Map<String, SaiaeSourceRegistry>
    ) {
        val effectiveRisk = context.effectiveRisk
        val sentence = context.calmSentence

        // ─── Build card payload ───────────────────────────────────────────────
        val sourceList = buildSourceList(sourceMatches, registry)
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
        // Calm, non-alarmist lock-screen copy: a gentle title + the reassuring sentence.
        // We deliberately do NOT put a scary event label in the title.
        val push: Map<String, String>? = if (context.pushEligible) {
            val title = truncate("Update about ${watchedUser.name}", 50)
            val body  = truncate(sentence, 120)
            mapOf("title" to title, "body" to body)
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

        // Dedup per (observer, event): one push per event unless it genuinely escalates.
        val lastPush = pushLogRepo.findLatestForEvent(observer.id, event.id!!)
        val shouldSend = lastPush == null || shouldEscalate(lastPush, context, confidence)
        if (!shouldSend) {
            logger.debug("Push suppressed (dedup) for user ${observer.id} event ${event.id}")
            return
        }

        // Record the dedup claim inside the transaction, then dispatch the (blocking)
        // Expo call only AFTER the transaction commits — so a slow network call never
        // holds a DB connection open, and a rolled-back pipeline never "sends".
        pushLogRepo.save(SaiaePushLog(
            userId            = observer.id,
            normalizedEventId = event.id,
            eventType         = event.category.name,
            city              = event.city ?: event.country,
            riskLevelAtSend   = context.effectiveRisk.name,
            confidenceAtSend  = confidence.score,
            userStatusAtSend  = context.userStatus.name,
        ))

        val expoToken  = token.token
        val observerId = observer.id
        val eventId    = event.id
        val category   = event.category.name
        afterCommit {
            pushNotificationService.sendPushNotification(
                expoPushToken    = expoToken,
                title            = pushTitle,
                body             = pushBody,
                categoryId       = "SAFETY_ALERT",
                userId           = observerId,
                notificationType = "saiae_${category.lowercase()}",
                // Carry the event id so the app can deep-link straight to the alert card.
                data             = mapOf("type" to "safety_alert", "eventId" to eventId.toString()),
            )
            logger.info("Push sent to observer $observerId for event $eventId ($category)")
        }
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
        val riskIncreased  = riskOrdinal(context.effectiveRisk.name) > riskOrdinal(last.riskLevelAtSend)
        val becameSilent   = context.userStatus.name == "SILENT" && last.userStatusAtSend != "SILENT"
        // Compare score-to-score (both Int); the previous tier-name-vs-score bug is gone.
        val confidenceRose = confidence.score >= last.confidenceAtSend + 10
        return riskIncreased || becameSilent || confidenceRose
    }

    private fun riskOrdinal(level: String) = when (level) {
        "IMPORTANT_DISRUPTION" -> 2; "STAY_AWARE" -> 1; else -> 0
    }

    /** Run [action] after the current transaction commits (or immediately if none is active). */
    private fun afterCommit(action: () -> Unit) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = action()
            })
        } else {
            action()
        }
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

    private fun buildSourceList(
        matches: List<SaiaeEventSourceMatch>,
        registry: Map<String, SaiaeSourceRegistry>
    ): List<Map<String, String?>> {
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
        "EXISTENCE" -> "Sources are still confirming whether this is happening."
        "DETAIL"    -> "Some details are still being confirmed across sources."
        else        -> null
    }

    private fun buildFooter(sources: List<Map<String, String?>>): String {
        val names = sources.filter { it["originSource"] == null }.mapNotNull { it["name"] }.joinToString(", ")
        return "Sources: $names · Ollia surfaces alerts, does not assert outcomes."
    }

    /** Word- and emoji-safe truncation: never splits a surrogate pair or mid-word. */
    private fun truncate(s: String, max: Int): String {
        if (s.length <= max) return s
        var cut = (max - 1).coerceIn(0, s.length)
        if (cut in 1 until s.length && Character.isLowSurrogate(s[cut])) cut--  // don't split an emoji
        val slice = s.substring(0, cut)
        val lastSpace = slice.lastIndexOf(' ')
        val safe = if (lastSpace >= max / 2) slice.substring(0, lastSpace) else slice
        return safe.trimEnd() + "…"
    }
}