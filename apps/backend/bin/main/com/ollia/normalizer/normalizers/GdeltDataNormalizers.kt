package com.ollia.normalizer.normalizers

import com.ollia.entity.*
import com.ollia.normalizer.SafetySignalNormalizer
import org.springframework.stereotype.Component

/**
 * GDELT normalizer — promotes GDELT signals into normalized events.
 *
 * GDELT events lack precise lat/lon and city, so radiusKm defaults to a
 * country-wide value. The downstream Risk Engine handles low-precision
 * geography via its distance fallback (50km when coordinates missing).
 */
@Component
class GdeltNormalizer : SafetySignalNormalizer {

    override fun canHandle(raw: RawSafetyEvent) = raw.source == SourceType.GDELT

    override fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent? {
        val severity = raw.severityHint ?: Severity.LOW
        return NormalizedSafetyEvent(
            rawSignalId = raw.id!!,
            source      = TrustedDomains.attribute(raw.source, raw.sourceUrl),
            category    = raw.category ?: SafetyCategory.OTHER,
            severity    = severity,
            title       = raw.title ?: "Security event reported",
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
        SafetyCategory.WAR              -> 300.0   // country-scale relevance
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
