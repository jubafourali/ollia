package com.ollia.scheduler

import com.ollia.entity.User
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.PushTokenRepository
import com.ollia.repository.UserRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Authoritative quiet → family escalation ladder (one doctrine).
 *
 *   L0 → 1 : no human check-in past [inactivityThresholdHours]
 *            AND no recent phone murmur (passive) → nudge user
 *   L1 → 2 : still no human response after 30 min → notify circle
 *   L2 → 3 : still quiet after 2 h → last resort: circle gets emergency
 *            contact name + phone so someone can call (honest, no fake SMS)
 *
 * Soft "tap to check in" reminders stay in [NudgeScheduler] (user-only).
 * Family alerting lives here only.
 *
 * Human "I'm OK" resets level → 0. Passive murmur only delays L1.
 */

private object PushMessages {
    data class Messages(
        val l1Body: String,
        val l2Body: String,
        val l3Body: String,
        val l3BodyWithPhone: String,
        val l2Title: String,
        val l3Title: String,
    )

    private val translations: Map<String, Messages> = mapOf(
        "en" to Messages(
            l1Body = "Are you okay? Tap to let your family know.",
            l2Body = "%s hasn't checked in and their phone has gone quiet. You may want to reach out.",
            l3Body = "%s has been unreachable for an extended period. Please check on them.",
            l3BodyWithPhone = "%s is still unreachable. Last resort contact: %s — %s. Please call.",
            l2Title = "Ollia",
            l3Title = "Ollia — Urgent"
        ),
        "fr" to Messages(
            l1Body = "Vous allez bien ? Appuyez pour le faire savoir à votre famille.",
            l2Body = "%s ne s'est pas manifesté(e) et son téléphone est silencieux. Prenez de ses nouvelles.",
            l3Body = "%s est injoignable depuis une période prolongée. Veuillez vérifier.",
            l3BodyWithPhone = "%s est toujours injoignable. Contact de secours : %s — %s. Appelez.",
            l2Title = "Ollia",
            l3Title = "Ollia — Urgent"
        ),
        "ar" to Messages(
            l1Body = "هل أنت بخير؟ اضغط لإعلام عائلتك.",
            l2Body = "لم يسجل %s وهواتفه هادئ. ربما تريد التواصل.",
            l3Body = "كان %s غير متاح لفترة طويلة. يرجى التحقق منه.",
            l3BodyWithPhone = "%s لا يزال غير متاح. جهة الطوارئ: %s — %s. يرجى الاتصال.",
            l2Title = "أوليا",
            l3Title = "أوليا — عاجل"
        ),
        "bs" to Messages(
            l1Body = "Jeste li dobro? Tapnite da obavijestite svoju porodicu.",
            l2Body = "%s se nije javio/la i telefon je tih. Možda biste trebali provjeriti.",
            l3Body = "%s je nedostupan/na duži period. Molimo provjerite.",
            l3BodyWithPhone = "%s je još uvijek nedostupan/na. Hitni kontakt: %s — %s. Nazovite.",
            l2Title = "Ollia",
            l3Title = "Ollia — Hitno"
        )
    )

    fun forLang(lang: String): Messages = translations[lang] ?: translations["en"]!!
}

@Component
class EscalationScheduler(
    private val userRepository: UserRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val pushNotificationService: PushNotificationService
) {

    private val logger = LoggerFactory.getLogger(javaClass)

    /** Phone murmur within this window means "still soft-present" — delay L1. */
    private val passiveSuppressHours = 2L

    @Scheduled(fixedRate = 300_000)
    fun processEscalations() {
        checkScheduledDeadlines()
        escalateToLevel1()
        escalateToLevel2()
        escalateToLevel3()
    }

    private fun checkScheduledDeadlines() {
        val now = Instant.now()
        val users = userRepository.findAllByScheduledCheckInDeadlineBeforeAndEscalationLevel(
            deadline = now,
            escalationLevel = 0
        )

        for (user in users) {
            user.scheduledCheckInDeadline = null
            notifyFamilyCircle(user)
            user.escalationLevel = 2
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Scheduled deadline expired for user ${user.id} — escalated to L2")
        }
    }

    private fun escalateToLevel1() {
        val candidates = userRepository.findAllByEscalationLevelAndLastSeenAtBefore(
            escalationLevel = 0,
            threshold = Instant.now().minus(1, ChronoUnit.HOURS)
        )

        val now = Instant.now()
        for (user in candidates) {
            if (!user.notifyInactivity) continue
            val thresholdInstant = now.minus(user.inactivityThresholdHours.toLong(), ChronoUnit.HOURS)
            // Authoritative quiet: human check-in stale (fallback lastSeen if never checked in).
            val humanRef = user.lastCheckInAt ?: user.lastSeenAt ?: continue
            if (humanRef.isAfter(thresholdInstant)) continue
            // Soft presence: phone murmuring → don't escalate yet.
            val passive = user.lastPassiveSignalAt
            if (passive != null && Duration.between(passive, now).toHours() < passiveSuppressHours) continue

            val token = pushTokenRepository.findByUserId(user.id!!) ?: continue
            val msgs = PushMessages.forLang(user.preferredLanguage)
            pushNotificationService.sendPushNotification(
                expoPushToken = token.token,
                title = "Ollia",
                body = msgs.l1Body,
                userId = user.id,
                notificationType = "escalation_l1",
            )
            user.escalationLevel = 1
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Escalation L1 for user ${user.id}")
        }
    }

    private fun escalateToLevel2() {
        val threshold = Instant.now().minus(30, ChronoUnit.MINUTES)
        val users = userRepository.findAllByEscalationLevelAndEscalationChangedAtBefore(
            escalationLevel = 1,
            threshold = threshold
        )

        val now = Instant.now()
        for (user in users) {
            if (!user.notifyInactivity) continue
            notifyFamilyCircle(user)
            user.escalationLevel = 2
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Escalation L2 for user ${user.id}")
        }
    }

    private fun escalateToLevel3() {
        val threshold = Instant.now().minus(2, ChronoUnit.HOURS)
        val users = userRepository.findAllByEscalationLevelAndEscalationChangedAtBefore(
            escalationLevel = 2,
            threshold = threshold
        )

        val now = Instant.now()
        for (user in users) {
            if (!user.notifyInactivity) continue
            notifyLastResort(user)
            user.escalationLevel = 3
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Escalation L3 for user ${user.id}")
        }
    }

    private fun notifyFamilyCircle(inactiveUser: User) {
        val memberships = familyMemberRepository.findAllByUserId(inactiveUser.id!!)
        val circleIds = memberships.map { it.circleId }.distinct()

        for (circleId in circleIds) {
            val peers = familyMemberRepository.findAllByCircleId(circleId)
                .filter { it.userId != inactiveUser.id }

            val peerUsers = userRepository.findAllById(peers.map { it.userId })
                .filter { it.notifyInactivity }

            val tokens = pushTokenRepository.findAllByUserIdIn(peerUsers.mapNotNull { it.id })
            val tokenMap = tokens.associateBy { it.userId }

            for (peer in peerUsers) {
                val token = tokenMap[peer.id] ?: continue
                val msgs = PushMessages.forLang(peer.preferredLanguage)
                pushNotificationService.sendPushNotification(
                    expoPushToken = token.token,
                    title = msgs.l2Title,
                    body = msgs.l2Body.format(inactiveUser.name),
                    userId = peer.id,
                    notificationType = "escalation_l2",
                )
            }
        }
    }

    /**
     * Last resort: tell the whole circle who to call. We don't send SMS ourselves
     * (honest product) — we put name + phone in the urgent push so someone can.
     */
    private fun notifyLastResort(user: User) {
        val name = user.emergencyContactName?.takeIf { it.isNotBlank() }
        val phone = user.emergencyContactPhone?.takeIf { it.isNotBlank() }

        val memberships = familyMemberRepository.findAllByUserId(user.id!!)
        val circleIds = memberships.map { it.circleId }.distinct()
        var sent = 0

        for (circleId in circleIds) {
            val peers = familyMemberRepository.findAllByCircleId(circleId)
                .filter { it.userId != user.id }
            val peerUsers = userRepository.findAllById(peers.map { it.userId })
            val tokens = pushTokenRepository.findAllByUserIdIn(peerUsers.mapNotNull { it.id })
            val tokenMap = tokens.associateBy { it.userId }

            for (peer in peerUsers) {
                val token = tokenMap[peer.id] ?: continue
                val msgs = PushMessages.forLang(peer.preferredLanguage)
                val body = if (name != null && phone != null) {
                    msgs.l3BodyWithPhone.format(user.name, name, phone)
                } else {
                    msgs.l3Body.format(user.name)
                }
                pushNotificationService.sendPushNotification(
                    expoPushToken = token.token,
                    title = msgs.l3Title,
                    body = body,
                    userId = peer.id,
                    notificationType = "escalation_l3",
                    data = buildMap {
                        put("type", "escalation_l3")
                        if (phone != null) put("emergencyPhone", phone)
                        if (name != null) put("emergencyName", name)
                    },
                )
                sent++
            }
        }

        if (sent == 0) {
            logger.warn("L3 for user ${user.id}: no circle peers to notify")
        } else if (phone == null) {
            logger.warn("L3 for user ${user.id}: no emergency phone configured — circle still notified")
        }
    }
}
