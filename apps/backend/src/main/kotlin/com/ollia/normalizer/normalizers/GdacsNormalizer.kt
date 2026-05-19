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
                Severity.CRITICAL -> 500.0; Severity.HIGH -> 300.0; else -> 150.0
            }
            SafetyCategory.FLOOD, SafetyCategory.TSUNAMI -> when (sev) {
                Severity.CRITICAL -> 200.0; Severity.HIGH -> 100.0; else -> 50.0
            }
            else -> when (sev) {
                Severity.CRITICAL -> 150.0; Severity.HIGH -> 80.0; Severity.MEDIUM -> 40.0; Severity.LOW -> 20.0
            }
        }
    }
}
