// ─── GdacsNormalizer.kt ───────────────────────────────────────────────────────
package com.ollia.normalizer.normalizers

import com.ollia.entity.*
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

// ─── NoaaNormalizer.kt ────────────────────────────────────────────────────────
package com.ollia.normalizer.normalizers

import com.ollia.entity.*
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
