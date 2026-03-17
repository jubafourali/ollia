package com.ollia.scheduler

import com.ollia.repository.PushTokenRepository
import com.ollia.repository.UserRepository
import com.ollia.service.PushNotificationService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.temporal.ChronoUnit

@Component
class CheckInScheduler(
    private val userRepository: UserRepository,
    private val pushTokenRepository: PushTokenRepository,
    private val pushNotificationService: PushNotificationService
) {

    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedRate = 3600000)
    fun checkInactiveUsers() {
        val threshold = Instant.now().minus(18, ChronoUnit.HOURS)
        val inactiveUsers = userRepository.findAllByLastSeenAtBefore(threshold)

        if (inactiveUsers.isEmpty()) return
        logger.info("Found ${inactiveUsers.size} inactive users")

        val userIds = inactiveUsers.mapNotNull { it.id }
        val pushTokens = pushTokenRepository.findAllByUserIdIn(userIds)
        val tokenMap = pushTokens.associateBy { it.userId }

        for (user in inactiveUsers) {
            val pushToken = tokenMap[user.id] ?: continue
            pushNotificationService.sendPushNotification(
                expoPushToken = pushToken.token,
                title = "Ollia",
                body = "Just checking in — tap to let your family know you're okay."
            )
        }
    }
}
