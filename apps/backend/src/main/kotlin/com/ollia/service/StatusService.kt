package com.ollia.service

import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant

@Service
class StatusService {

    fun computeStatus(lastSeenAt: Instant?): String {
        if (lastSeenAt == null) return "inactive"
        val minutes = Duration.between(lastSeenAt, Instant.now()).toMinutes()
        return when {
            minutes < 30 -> "active"
            minutes < 180 -> "recent"    // 3 hours
            minutes < 720 -> "away"      // 12 hours
            else -> "inactive"
        }
    }
}
