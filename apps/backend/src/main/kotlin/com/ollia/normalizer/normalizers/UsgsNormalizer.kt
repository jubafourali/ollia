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
class UsgsNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.USGS

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        // USGS collector already maps severity and category — just promote the raw signal
        val severity = raw.severityHint ?: Severity.LOW
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source      = raw.source,
            category    = raw.category ?: SafetyCategory.EARTHQUAKE,
            severity    = severity,
            title       = raw.title ?: "Earthquake",
            description = raw.description,
            country     = raw.country,
            city        = raw.city,
            latitude    = raw.latitude,
            longitude   = raw.longitude,
            radiusKm    = radiusForSeverity(severity),
            eventOccurredAt = raw.eventOccurredAt ?: raw.collectedAt,
            status      = EventStatus.PENDING_VERIFICATION
        )
    }

    private fun radiusForSeverity(s: Severity) = when (s) {
        Severity.CRITICAL -> 200.0
        Severity.HIGH     -> 100.0
        Severity.MEDIUM   -> 50.0
        Severity.LOW      -> 20.0
    }
}
