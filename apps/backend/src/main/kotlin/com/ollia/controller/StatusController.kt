package com.ollia.controller

import com.ollia.dto.StatusResponse
import com.ollia.repository.UserRepository
import com.ollia.service.StatusService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api")
class StatusController(
    private val userRepository: UserRepository,
    private val statusService: StatusService
) {

    @GetMapping("/status/{userId}")
    fun getStatus(@PathVariable userId: UUID): StatusResponse {
        val user = userRepository.findById(userId)
            .orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "User not found") }
        return StatusResponse(
            status = statusService.computeStatus(user.lastSeenAt),
            lastSeenAt = user.lastSeenAt
        )
    }
}
