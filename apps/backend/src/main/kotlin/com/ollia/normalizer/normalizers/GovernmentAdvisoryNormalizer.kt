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
class GovernmentAdvisoryNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.GOVERNMENT_ALERT

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        // Country is required for an advisory to be relevant to anyone.
        val country = raw.country ?: return null
        return NormalizedSafetyEvent(
            rawSignalId     = raw.id!!,
            source          = raw.source,
            category        = raw.category ?: SafetyCategory.GOVERNMENT_ADVISORY,
            severity        = raw.severityHint ?: Severity.MEDIUM,
            title           = raw.title ?: "Travel advisory",
            description     = raw.description,
            country         = country,
            city            = null,
            latitude        = null,
            longitude       = null,
            radiusKm        = null,   // country-wide advisory, not a point event
            eventOccurredAt = raw.eventOccurredAt ?: raw.collectedAt,
            status          = EventStatus.PENDING_VERIFICATION,
        )
    }
}