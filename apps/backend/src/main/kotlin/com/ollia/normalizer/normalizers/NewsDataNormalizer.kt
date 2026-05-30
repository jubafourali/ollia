package com.ollia.normalizer.normalizers

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SafetyCategory
import com.ollia.entity.Severity
import com.ollia.entity.SourceType
import com.ollia.normalizer.SafetySignalNormalizer
import org.springframework.stereotype.Component

/**
 * NewsData normalizer — same logic as GDELT, since both produce news-derived
 * events with similar geographic precision (country-level, no city).
 */
@Component
class NewsDataNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.NEWSDATA

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        val severity = raw.severityHint ?: Severity.LOW
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source      = raw.source,
            category    = raw.category ?: SafetyCategory.OTHER,
            severity    = severity,
            title       = raw.title ?: "News event reported",
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

    private fun radiusForCategory(cat: SafetyCategory?, sev: Severity): Double = when (cat) {
        SafetyCategory.MISSILE_ATTACK,
        SafetyCategory.ARMED_CONFLICT,
        SafetyCategory.WAR              -> 300.0
        SafetyCategory.TERRORISM,
        SafetyCategory.ACTIVE_SHOOTER,
        SafetyCategory.EXPLOSION        -> when (sev) {
            Severity.CRITICAL -> 100.0; Severity.HIGH -> 50.0; else -> 25.0
        }
        SafetyCategory.RIOT,
        SafetyCategory.PROTEST,
        SafetyCategory.CIVIL_UNREST     -> 30.0
        SafetyCategory.CURFEW           -> 100.0
        SafetyCategory.BORDER_TENSION   -> 150.0
        else                            -> 50.0
    }
}