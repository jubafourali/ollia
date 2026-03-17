package com.ollia.controller

import com.ollia.dto.HeartbeatResponse
import com.ollia.entity.ActivitySignal
import com.ollia.repository.ActivitySignalRepository
import com.ollia.repository.UserRepository
import com.ollia.service.CurrentUserService
import org.slf4j.LoggerFactory
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api")
class HeartbeatController(
    private val currentUserService: CurrentUserService,
    private val activitySignalRepository: ActivitySignalRepository,
    private val userRepository: UserRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @PostMapping("/heartbeat")
    fun heartbeat(): HeartbeatResponse {
        logger.info("Checking heartbeat")
        val user = currentUserService.getCurrentUser()
        activitySignalRepository.save(ActivitySignal(userId = user.id!!))
        user.lastSeenAt = Instant.now()
        userRepository.save(user)
        return HeartbeatResponse()
    }
}
