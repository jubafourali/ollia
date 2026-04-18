package com.ollia.scheduler

import com.ollia.entity.User
import com.ollia.repository.ActivitySignalRepository
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.PushTokenRepository
import com.ollia.repository.UserRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/**
 * Reassurance nudge ladder. Runs every 15 minutes.
 *
 * Only human check-ins (lastCheckInAt) count — passive signals exist only
 * to *suppress* nudges when the phone is clearly in use.
 *
 *   T ≥ threshold      → first nudge to user  ("A little check-in goes a long way")
 *   T ≥ threshold + 3h → second nudge (premium only)
 *   T ≥ 18h            → soft family notification
 *   T ≥ 30h            → strong family notification
 *
 * Threshold is 8h fixed for free users and `inactivityThresholdHours` for premium.
 * Sleep window (11pm–8am local): free is always quiet; premium is quiet too unless
 * a scheduled deadline has passed OR the user opted into urgent overnight alerts.
 */
private const val FREE_THRESHOLD_HOURS = 8
private const val SECOND_NUDGE_DELAY_HOURS = 3L
private const val FAMILY_SOFT_HOURS = 18L
private const val FAMILY_STRONG_HOURS = 30L
private const val PASSIVE_SUPPRESS_HOURS = 2L
private const val SLEEP_START_HOUR = 23
private const val SLEEP_END_HOUR = 8

private object NudgeMessages {
    data class Messages(
        val firstNudge: String,
        val secondNudge: String,
        val soft: String,
        val strong: String,
        val softTitle: String,
        val strongTitle: String,
        val nudgeTitle: String
    )

    private val translations: Map<String, Messages> = mapOf(
        "en" to Messages(
            firstNudge = "A little check-in goes a long way 💛",
            secondNudge = "Still thinking of you. One tap is all it takes.",
            soft = "%s hasn't checked in today. You may want to reach out.",
            strong = "%s hasn't been heard from in over a day. Please check on them.",
            softTitle = "Ollia",
            strongTitle = "Ollia — Urgent",
            nudgeTitle = "Ollia"
        ),
        "fr" to Messages(
            firstNudge = "Un petit check-in, ça compte beaucoup 💛",
            secondNudge = "On pense à toi. Un simple geste suffit.",
            soft = "%s ne s’est pas manifesté aujourd’hui. Vous pourriez prendre de ses nouvelles.",
            strong = "%s est injoignable depuis un moment. Merci de vérifier que tout va bien.",
            softTitle = "Ollia",
            strongTitle = "Ollia — Urgent",
            nudgeTitle = "Ollia"
        ),
        "ar" to Messages(
            firstNudge = "تسجيل صغير يُحدث فرقاً كبيراً 💛",
            secondNudge = "ما زلنا نفكر فيك. ضغطة واحدة تكفي.",
            soft = "%s لم يسجل اليوم. ربما تود التواصل معه.",
            strong = "%s لم يتم التواصل معه منذ أكثر من يوم. يرجى التحقق منه.",
            softTitle = "أوليا",
            strongTitle = "أوليا — عاجل",
            nudgeTitle = "أوليا"
        ),
        "bs" to Messages(
            firstNudge = "Mala provjera znači mnogo 💛",
            secondNudge = "Još uvijek mislimo na tebe. Jedan dodir je dovoljan.",
            soft = "%s se danas nije javio/la. Možda biste trebali provjeriti.",
            strong = "%s se nije javio/la više od jednog dana. Molimo provjerite.",
            softTitle = "Ollia",
            strongTitle = "Ollia — Hitno",
            nudgeTitle = "Ollia"
        )
    )

    fun forLang(lang: String): Messages = translations[lang] ?: translations["en"]!!
}

@Component
class NudgeScheduler(
    private val userRepository: UserRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val activitySignalRepository: ActivitySignalRepository,
    private val pushNotificationService: PushNotificationService
) {

    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedRate = 15 * 60_000)
    fun processNudges() {
        val now = Instant.now()
        val tokens = pushTokenRepository.findAll()
        if (tokens.isEmpty()) return
        val userIds = tokens.mapNotNull { it.userId }.distinct()
        val users = userRepository.findAllById(userIds)
        val tokenByUserId = tokens.associateBy { it.userId }

        for (user in users) {
            val token = tokenByUserId[user.id] ?: continue
            try {
                processUser(user, token.token, now)
            } catch (e: Exception) {
                logger.error("Nudge processing failed for user ${user.id}", e)
            }
        }
    }

    private fun processUser(user: User, pushToken: String, now: Instant) {
        val lastCheckIn = user.lastCheckInAt ?: return

        if (user.nudgeSentAt != null && lastCheckIn.isAfter(user.nudgeSentAt)) {
            user.nudgeSentAt = null
            user.secondNudgeSentAt = null
            user.familyNotified = false
            user.familyNotifiedStrong = false
            userRepository.save(user)
        }

        if (user.familyNotifiedStrong) return

        val isPremium = user.plan == "premium"
        val thresholdHours = if (isPremium) user.inactivityThresholdHours else FREE_THRESHOLD_HOURS
        val sinceCheckIn = Duration.between(lastCheckIn, now)
        if (sinceCheckIn.toHours() < thresholdHours) return

        val zone = resolveZone(user.timezone)
        val localHour = ZonedDateTime.ofInstant(now, zone).hour
        val inSleepWindow = isInSleepWindow(localHour)
        if (inSleepWindow) {
            if (!isPremium) return
            val scheduledPassed = user.scheduledCheckInDeadline != null &&
                user.scheduledCheckInDeadline!!.isBefore(now)
            if (!scheduledPassed && !user.urgentOvernightAlerts) return
        }

        val lastPassive = user.lastPassiveSignalAt
        if (lastPassive != null && Duration.between(lastPassive, now).toHours() < PASSIVE_SUPPRESS_HOURS) return

        if (isPremium && shouldDeferForHabit(user, now, zone, localHour)) return

        val msgs = NudgeMessages.forLang(user.preferredLanguage)

        if (user.nudgeSentAt == null) {
            pushNotificationService.sendPushNotification(
                expoPushToken = pushToken,
                title = msgs.nudgeTitle,
                body = msgs.firstNudge,
                "CHECKIN_NUDGE"
            )
            user.nudgeSentAt = now
            userRepository.save(user)
            logger.info("First nudge sent to user ${user.id}")
            return
        }

        if (isPremium &&
            user.secondNudgeSentAt == null &&
            Duration.between(user.nudgeSentAt!!, now).toHours() >= SECOND_NUDGE_DELAY_HOURS
        ) {
            pushNotificationService.sendPushNotification(
                expoPushToken = pushToken,
                title = msgs.nudgeTitle,
                body = msgs.secondNudge,
                "CHECKIN_NUDGE"
            )
            user.secondNudgeSentAt = now
            userRepository.save(user)
            logger.info("Second nudge sent to user ${user.id}")
        }

        if (!user.familyNotified && sinceCheckIn.toHours() >= FAMILY_SOFT_HOURS) {
            notifyFamily(user, strong = false)
            user.familyNotified = true
            userRepository.save(user)
            logger.info("Soft family notification sent for user ${user.id}")
        }

        if (!user.familyNotifiedStrong && sinceCheckIn.toHours() >= FAMILY_STRONG_HOURS) {
            notifyFamily(user, strong = true)
            user.familyNotifiedStrong = true
            userRepository.save(user)
            logger.info("Strong family notification sent for user ${user.id}")
        }
    }

    private fun resolveZone(tz: String?): ZoneId =
        try {
            if (tz.isNullOrBlank()) ZoneId.of("UTC") else ZoneId.of(tz)
        } catch (_: Exception) {
            ZoneId.of("UTC")
        }

    private fun isInSleepWindow(hour: Int): Boolean =
        hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR

    /**
     * Defer the nudge if the user historically checks in later than the current local hour.
     * Needs ≥3 human check-ins in the last 7 days; uses the median hour as their "typical" hour.
     * Once the current local hour is at or past typical, we stop deferring.
     */
    private fun shouldDeferForHabit(user: User, now: Instant, zone: ZoneId, localHour: Int): Boolean {
        val since = now.minus(7, ChronoUnit.DAYS)
        val signals = activitySignalRepository
            .findAllByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(user.id!!, since)
            .filter { it.signalType in HUMAN_SIGNAL_TYPES }
        if (signals.size < 3) return false
        val hours = signals.map { ZonedDateTime.ofInstant(it.createdAt, zone).hour }.sorted()
        val median = hours[hours.size / 2]
        return localHour < median
    }

    private fun notifyFamily(inactiveUser: User, strong: Boolean) {
        val memberships = familyMemberRepository.findAllByUserId(inactiveUser.id!!)
        val circleIds = memberships.map { it.circleId }.distinct()
        for (circleId in circleIds) {
            val peers = familyMemberRepository.findAllByCircleId(circleId)
                .filter { it.userId != inactiveUser.id }
            val peerUsers = userRepository.findAllById(peers.map { it.userId })
                .filter { it.notifyInactivity }
            val tokens = pushTokenRepository.findAllByUserIdIn(peerUsers.mapNotNull { it.id })
                .associateBy { it.userId }
            for (peer in peerUsers) {
                val token = tokens[peer.id] ?: continue
                val msgs = NudgeMessages.forLang(peer.preferredLanguage)
                pushNotificationService.sendPushNotification(
                    expoPushToken = token.token,
                    title = if (strong) msgs.strongTitle else msgs.softTitle,
                    body = (if (strong) msgs.strong else msgs.soft).format(inactiveUser.name)
                )
            }
        }
    }

    companion object {
        private val HUMAN_SIGNAL_TYPES = setOf("heartbeat", "check_in_response", "shortcut")
    }
}
