package com.ollia.normalizer.normalizers

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.normalizer.SafetySignalNormalizer
import org.springframework.stereotype.Component

@Component
class OpenMeteoNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.OPEN_METEO

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source = raw.source,
            category = raw.category ?: return null,
            severity = raw.severityHint ?: Severity.HIGH,
            title = raw.title ?: "Severe weather conditions",
            description = raw.description,
            country = raw.country,
            city = raw.city,
            latitude = raw.latitude,
            longitude = raw.longitude,
            radiusKm = 80.0,
            eventOccurredAt = raw.eventOccurredAt ?: raw.collectedAt,
            status = EventStatus.PENDING_VERIFICATION
        )
    }
}
