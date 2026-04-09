package com.ollia.scheduler

import com.ollia.entity.User
import com.ollia.repository.FamilyMemberRepository
import com.ollia.repository.PushTokenRepository
import com.ollia.repository.UserRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Inactivity escalation chain:
 *
 *   Level 0 → 1 : user inactive for their configured threshold (default 3 h)
 *                  → silent push to user: "Are you okay?"
 *   Level 1 → 2 : no response 30 min after level-1 push
 *                  → push to family circle members with notifyInactivity = true
 *   Level 2 → 3 : no signal 2 h after level-2 push
 *                  → push to user's designated emergency contact
 *
 * Any incoming activity signal (heartbeat / check-in / background) resets
 * escalation_level → 0 immediately (handled in the activity endpoint).
 */
@Component
class EscalationScheduler(
    private val userRepository: UserRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val familyMemberRepository: FamilyMemberRepository,
    private val pushNotificationService: PushNotificationService
) {

    private val logger = LoggerFactory.getLogger(javaClass)

    /** Runs every 5 minutes. */
    @Scheduled(fixedRate = 300_000)
    fun processEscalations() {
        checkScheduledDeadlines()
        escalateToLevel1()
        escalateToLevel2()
        escalateToLevel3()
    }

    // ── Scheduled mode: deadline expired → jump to Level 2 ────────

    /**
     * If a user set a "scheduled check-in" deadline and it has passed without
     * any activity signal, skip Level 1 (user already knew the risk) and
     * immediately notify their family circle (Level 2).
     */
    private fun checkScheduledDeadlines() {
        val now = Instant.now()
        val users = userRepository.findAllByScheduledCheckInDeadlineBeforeAndEscalationLevel(
            deadline = now,
            escalationLevel = 0
        )

        for (user in users) {
            // Clear the one-time deadline
            user.scheduledCheckInDeadline = null
            // Jump straight to Level 2 (family notification)
            notifyFamilyCircle(user)
            user.escalationLevel = 2
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Scheduled deadline expired for user ${user.id} — escalated to L2")
        }
    }

    // ── Level 0 → 1: Notify the inactive user ──────────────────────

    private fun escalateToLevel1() {
        // We need users at level 0 whose lastSeenAt is older than their threshold.
        // Since thresholds vary per user we fetch all level-0 users with any
        // lastSeenAt and filter in memory (the index keeps this fast).
        val candidates = userRepository.findAllByEscalationLevelAndLastSeenAtBefore(
            escalationLevel = 0,
            threshold = Instant.now().minus(1, ChronoUnit.HOURS) // minimum sanity floor
        )

        val now = Instant.now()
        for (user in candidates) {
            if (!user.notifyInactivity) continue
            val thresholdInstant = now.minus(user.inactivityThresholdHours.toLong(), ChronoUnit.HOURS)
            if (user.lastSeenAt == null || user.lastSeenAt!!.isAfter(thresholdInstant)) continue

            val token = pushTokenRepository.findByUserId(user.id!!) ?: continue
            pushNotificationService.sendPushNotification(
                expoPushToken = token.token,
                title = "Ollia",
                body = "Are you okay? Tap to let your family know."
            )
            user.escalationLevel = 1
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Escalation L1 for user ${user.id}")
        }
    }

    // ── Level 1 → 2: Notify family circle members ──────────────────

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

    // ── Level 2 → 3: Notify emergency contact ──────────────────────

    private fun escalateToLevel3() {
        val threshold = Instant.now().minus(2, ChronoUnit.HOURS)
        val users = userRepository.findAllByEscalationLevelAndEscalationChangedAtBefore(
            escalationLevel = 2,
            threshold = threshold
        )

        val now = Instant.now()
        for (user in users) {
            if (!user.notifyInactivity) continue
            notifyEmergencyContact(user)
            user.escalationLevel = 3
            user.escalationChangedAt = now
            userRepository.save(user)
            logger.info("Escalation L3 for user ${user.id}")
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────

    /**
     * Send a push notification to every family-circle peer who has
     * notifyInactivity enabled.
     */
    private fun notifyFamilyCircle(inactiveUser: User) {
        val memberships = familyMemberRepository.findAllByUserId(inactiveUser.id!!)
        val circleIds = memberships.map { it.circleId }.distinct()

        for (circleId in circleIds) {
            val peers = familyMemberRepository.findAllByCircleId(circleId)
                .filter { it.userId != inactiveUser.id }

            val peerUserIds = peers.map { it.userId }
            val peerUsers = userRepository.findAllById(peerUserIds)
                .filter { it.notifyInactivity }

            val tokens = pushTokenRepository.findAllByUserIdIn(peerUsers.mapNotNull { it.id })
            val tokenMap = tokens.associateBy { it.userId }

            for (peer in peerUsers) {
                val token = tokenMap[peer.id] ?: continue
                pushNotificationService.sendPushNotification(
                    expoPushToken = token.token,
                    title = "Ollia",
                    body = "${inactiveUser.name} hasn't been active for a while. You may want to check in."
                )
            }
        }
    }

    /**
     * Send a push notification to the user's designated emergency contact.
     * Currently limited to push notifications (the emergency contact must also
     * be an Ollia user with a push token). SMS/call escalation can be added later.
     */
    private fun notifyEmergencyContact(user: User) {
        if (user.emergencyContactPhone.isNullOrBlank()) {
            logger.warn("User ${user.id} has no emergency contact configured — skipping L3")
            return
        }

        // Try to find the emergency contact as an Ollia user by matching name
        // within the user's family circles. This keeps everything in-app.
        val memberships = familyMemberRepository.findAllByUserId(user.id!!)
        val circleIds = memberships.map { it.circleId }.distinct()

        for (circleId in circleIds) {
            val peers = familyMemberRepository.findAllByCircleId(circleId)
                .filter { it.userId != user.id }

            val peerUsers = userRepository.findAllById(peers.map { it.userId })
            val emergencyUser = peerUsers.find {
                it.name.equals(user.emergencyContactName, ignoreCase = true)
            } ?: continue

            val token = pushTokenRepository.findByUserId(emergencyUser.id!!) ?: continue
            pushNotificationService.sendPushNotification(
                expoPushToken = token.token,
                title = "Ollia — Urgent",
                body = "${user.name} has been unreachable for an extended period. Please check on them."
            )
            return
        }

        logger.warn("Emergency contact '${user.emergencyContactName}' not found in circles for user ${user.id}")
    }
}
