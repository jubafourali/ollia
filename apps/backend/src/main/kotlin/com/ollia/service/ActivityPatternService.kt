package com.ollia.service

import com.ollia.repository.ActivitySignalRepository
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

data class ActivityPattern(
    val totalSignals: Int,
    val averageSignalsPerDay: Double,
    val mostActiveHour: Int?,
    val streakDays: Int,
    val lastActiveAt: Instant?,
    val hourlyDistribution: Map<Int, Int>
)

@Service
class ActivityPatternService(
    private val activitySignalRepository: ActivitySignalRepository
) {

    fun analyzePatterns(userId: UUID): ActivityPattern {
        val since = Instant.now().minus(30, ChronoUnit.DAYS)
        val signals = activitySignalRepository.findAllByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(userId, since)

        if (signals.isEmpty()) {
            return ActivityPattern(
                totalSignals = 0,
                averageSignalsPerDay = 0.0,
                mostActiveHour = null,
                streakDays = 0,
                lastActiveAt = null,
                hourlyDistribution = emptyMap()
            )
        }

        val hourlyDistribution = signals.groupBy { signal ->
            signal.createdAt.atOffset(ZoneOffset.UTC).hour
        }.mapValues { it.value.size }

        val mostActiveHour = hourlyDistribution.maxByOrNull { it.value }?.key

        // Calculate streak: consecutive days with at least one signal
        val activeDays = signals.map { signal ->
            signal.createdAt.atOffset(ZoneOffset.UTC).toLocalDate()
        }.distinct().sorted()

        var streak = 0
        val today = Instant.now().atOffset(ZoneOffset.UTC).toLocalDate()
        var currentDay = today
        for (day in activeDays.reversed()) {
            if (day == currentDay || day == currentDay.minusDays(1)) {
                streak++
                currentDay = day
            } else {
                break
            }
        }

        val daySpan = ChronoUnit.DAYS.between(signals.last().createdAt, Instant.now()).coerceAtLeast(1)
        val avgPerDay = signals.size.toDouble() / daySpan

        return ActivityPattern(
            totalSignals = signals.size,
            averageSignalsPerDay = "%.1f".format(avgPerDay).toDouble(),
            mostActiveHour = mostActiveHour,
            streakDays = streak,
            lastActiveAt = signals.firstOrNull()?.createdAt,
            hourlyDistribution = hourlyDistribution
        )
    }
}
