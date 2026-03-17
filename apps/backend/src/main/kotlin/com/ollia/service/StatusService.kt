package com.ollia.service

import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant

@Service
class StatusService {

    fun computeStatus(lastSeenAt: Instant?): String {
        if (lastSeenAt == null) return "checkin"
        val hours = Duration.between(lastSeenAt, Instant.now()).toHours()
        return when {
            hours < 6 -> "safe"
            hours < 18 -> "quiet"
            else -> "checkin"
        }
    }
}
