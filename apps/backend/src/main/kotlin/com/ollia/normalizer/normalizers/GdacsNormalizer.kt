package com.ollia.normalizer.normalizers

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.normalizer.SafetySignalNormalizer
import org.springframework.stereotype.Component

@Component
class GdacsNormalizer : SafetySignalNormalizer {
    companion object {
        private const val CRITICAL_HURRICANE_RADIUS = 500.0
        private const val HIGH_HURRICANE_RADIUS = 300.0
        private const val DEFAULT_HURRICANE_RADIUS = 150.0

        private const val CRITICAL_TSUNAMI_FLOOD_RADIUS = 200.0
        private const val HIGH_TSUNAMI_FLOOD_RADIUS = 100.0
        private const val DEFAULT_TSUNAMI_FLOOD_RADIUS = 50.0

        private const val CRITICAL_OTHER_RADIUS = 150.0
        private const val HIGH_OTHER_RADIUS = 80.0
        private const val MEDIUM_OTHER_RADIUS = 40.0
        private const val LOW_OTHER_RADIUS = 20.0
    }

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.GDACS

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        val severity = raw.severityHint ?: Severity.LOW
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source      = raw.source,
            category    = raw.category ?: SafetyCategory.OTHER,
            severity    = severity,
            title       = raw.title ?: "Global disaster alert",
            description = raw.description,
            country     = raw.country,
            city        = raw.city,
            latitude    = raw.latitude,
            longitude   = raw.longitude,
            radiusKm    = radiusForCategory(raw.category, severity),
            eventOccurredAt = raw.eventOccurredAt ?: raw.collectedAt,
            status      = EventStatus.PENDING_VERIFICATION
        )
    }

    private fun radiusForCategory(cat: SafetyCategory?, sev: Severity): Double {
        return when (cat) {
            SafetyCategory.HURRICANE, SafetyCategory.EXTREME_WEATHER -> when (sev) {
                Severity.CRITICAL -> CRITICAL_HURRICANE_RADIUS; Severity.HIGH -> HIGH_HURRICANE_RADIUS; else -> DEFAULT_HURRICANE_RADIUS
            }
            SafetyCategory.FLOOD, SafetyCategory.TSUNAMI -> when (sev) {
                Severity.CRITICAL -> CRITICAL_TSUNAMI_FLOOD_RADIUS; Severity.HIGH -> HIGH_TSUNAMI_FLOOD_RADIUS; else -> DEFAULT_TSUNAMI_FLOOD_RADIUS
            }
            else -> when (sev) {
                Severity.CRITICAL -> CRITICAL_OTHER_RADIUS; Severity.HIGH -> HIGH_OTHER_RADIUS; Severity.MEDIUM -> MEDIUM_OTHER_RADIUS; Severity.LOW -> LOW_OTHER_RADIUS
            }
        }
    }
}
