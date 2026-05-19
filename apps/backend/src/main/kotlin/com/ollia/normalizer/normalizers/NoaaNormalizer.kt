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
class NoaaNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.NOAA

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        val category = mapCategory(raw.title ?: "")
        val severity = raw.severityHint ?: Severity.LOW
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source      = raw.source,
            category    = category,
            severity    = severity,
            title       = raw.title ?: "Weather alert",
            description = raw.description,
            country     = raw.country ?: "United States",
            city        = raw.city,
            latitude    = raw.latitude,
            longitude   = raw.longitude,
            radiusKm    = 100.0,
            eventOccurredAt = raw.eventOccurredAt ?: raw.collectedAt,
            status      = EventStatus.PENDING_VERIFICATION
        )
    }

    private fun mapCategory(title: String): SafetyCategory = when {
        title.contains("Hurricane", ignoreCase = true) ||
                title.contains("Tropical", ignoreCase = true)  -> SafetyCategory.HURRICANE
        title.contains("Tornado", ignoreCase = true)   -> SafetyCategory.TORNADO
        title.contains("Flood", ignoreCase = true)     -> SafetyCategory.FLOOD
        title.contains("Fire", ignoreCase = true) ||
                title.contains("Red Flag", ignoreCase = true)  -> SafetyCategory.WILDFIRE
        title.contains("Tsunami", ignoreCase = true)   -> SafetyCategory.TSUNAMI
        else                                           -> SafetyCategory.EXTREME_WEATHER
    }
}
