package com.ollia.saiae.correlation

import com.ollia.entity.EventStatus
import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.SaiaeEventSourceMatch
import com.ollia.entity.SaiaeSourceRegistry
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.saiae.police.ConfidenceCalculator
import com.ollia.saiae.police.SourceRegistryMapping
import com.ollia.saiae.repository.SaiaeEventSourceMatchRepository
import com.ollia.saiae.repository.SaiaeSourceRegistryRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Event correlation — the step that makes multi-source confidence real.
 *
 * The normalizer emits one event per raw signal, so an earthquake reported by USGS and
 * GDACS arrives as two separate normalized events. This service clusters such siblings
 * into a single **canonical** event and records one `SaiaeEventSourceMatch` per distinct
 * source (resolving echo chains via the registry's `typicallyRepublishes`). Duplicate
 * siblings are marked `MERGED` and point at the canonical.
 *
 * Existing VERIFIED events keep their identity (they anchor their cluster); pending
 * siblings fold into them and trigger a re-score. Returns the canonical events that need
 * (re)scoring this run.
 */
@Service
class EventCorrelationService(
    private val normalizedRepo: NormalizedSafetyEventRepository,
    private val matchRepo: SaiaeEventSourceMatchRepository,
    private val sourceRegistryRepo: SaiaeSourceRegistryRepository,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun correlate(): List<NormalizedSafetyEvent> {
        val candidates = normalizedRepo.findAllByStatusIn(
            listOf(EventStatus.PENDING_VERIFICATION, EventStatus.VERIFIED)
        )
        if (candidates.isEmpty()) return emptyList()

        val registry = sourceRegistryRepo.findAll().associateBy { it.id }

        // Existing VERIFIED events keep their identity and anchor their clusters.
        val canonicals = candidates.filter { it.status == EventStatus.VERIFIED }.toMutableList()
        val membersByCanonical = HashMap<UUID, MutableList<NormalizedSafetyEvent>>()
        canonicals.forEach { membersByCanonical[it.id!!] = mutableListOf(it) }

        // Strongest pending events first, so the most trustworthy report anchors a new cluster.
        val pending = candidates
            .filter { it.status == EventStatus.PENDING_VERIFICATION }
            .sortedWith(
                compareByDescending<NormalizedSafetyEvent> { trust(it, registry) }
                    .thenBy { it.eventOccurredAt ?: it.normalizedAt }
            )

        // Canonicals that changed this run and must be (re)scored — insertion-ordered, deduped.
        val needsScore = LinkedHashMap<UUID, NormalizedSafetyEvent>()

        for (event in pending) {
            val canonical = canonicals.firstOrNull {
                it.id != event.id &&
                    EventClustering.sameRealWorldEvent(it.clusterKey(), event.clusterKey())
            }
            if (canonical != null) {
                normalizedRepo.markMerged(event.id!!, canonical.id!!, EventStatus.MERGED)
                membersByCanonical.getValue(canonical.id!!).add(event)
                needsScore[canonical.id!!] = canonical   // gained a source → re-score
            } else {
                canonicals.add(event)
                membersByCanonical[event.id!!] = mutableListOf(event)
                needsScore[event.id!!] = event            // brand-new canonical → score
            }
        }

        // Materialize source matches only for canonicals that actually changed.
        for ((canonicalId, members) in membersByCanonical) {
            if (canonicalId !in needsScore) continue
            ensureSourceMatches(canonicalId, members, registry)
        }

        if (needsScore.isNotEmpty()) {
            logger.info("Correlation: ${needsScore.size} canonical events to score from ${candidates.size} candidates")
        }
        return needsScore.values.toList()
    }

    private fun ensureSourceMatches(
        canonicalId: UUID,
        members: List<NormalizedSafetyEvent>,
        registry: Map<String, SaiaeSourceRegistry>,
    ) {
        val recorded = matchRepo.findAllByNormalizedEventId(canonicalId)
            .map { it.sourceId }.toMutableSet()
        val present = members.map { SourceRegistryMapping.registryId(it.source) }.toSet()

        for (member in members) {
            val sourceId = SourceRegistryMapping.registryId(member.source)
            if (sourceId in recorded) continue   // same-source echo → recorded once
            val origin = EventClustering.resolveOrigin(
                sourceId,
                present,
                registry[sourceId]?.typicallyRepublishes?.toList()
            )
            matchRepo.save(
                SaiaeEventSourceMatch(
                    normalizedEventId = canonicalId,
                    sourceId          = sourceId,
                    reportedAt        = member.eventOccurredAt ?: member.normalizedAt,
                    originSourceId    = origin,
                )
            )
            recorded.add(sourceId)
        }
    }

    /** Standalone trust of an event's source, mirroring ConfidenceCalculator.soloConfidence. */
    private fun trust(event: NormalizedSafetyEvent, registry: Map<String, SaiaeSourceRegistry>): Int {
        val profile = registry[SourceRegistryMapping.registryId(event.source)] ?: return 0
        return profile.soloFloor ?: (profile.baseWeight + ConfidenceCalculator.ANCHOR_OFFSET)
    }

    private fun NormalizedSafetyEvent.clusterKey() = ClusterKey(
        category   = category,
        occurredAt = eventOccurredAt ?: normalizedAt,
        country    = country,
        city       = city,
        lat        = latitude,
        lng        = longitude,
    )
}