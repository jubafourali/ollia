package com.ollia.normalizer

import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.repository.NormalizedSafetyEventRepository
import com.ollia.repository.RawSafetySignalRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class NormalizerOrchestrator(
    private val normalizers: List<SafetySignalNormalizer>,
    private val rawRepository: RawSafetySignalRepository,
    private val normalizedRepository: NormalizedSafetyEventRepository
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    /**
     * Runs every 60 seconds. Picks up unprocessed raw signals, normalizes them,
     * and marks them as processed. Instrument sources (USGS, NOAA, GDACS) are
     * immediately promoted to VERIFIED since they don't need multi-source confirmation.
     */
    @Scheduled(fixedRate = 60_000)
    @Transactional
    fun normalize() {
        // TODO this should go in batches or by category or country ...
        val unprocessed = rawRepository.findAllUnprocessed()
        if (unprocessed.isEmpty()) return

        logger.info("Normalizing ${unprocessed.size} raw signals")

        val normalizedEvents = emptyList<NormalizedSafetyEvent>()

        for (raw in unprocessed) {
            try {
                val normalizer = normalizers.firstOrNull { it.canHandle(raw) }
                if (normalizer == null) {
                    logger.debug("No normalizer for source {} — skipping", raw.source)
                    continue
                }

                val event = normalizer.normalize(raw)
                if (event != null) normalizedEvents.plus(event)
            } catch (e: Exception) {
                logger.error("Failed to normalize raw signal ${raw.id}", e)
            }
        }

        normalizedRepository.saveAll(normalizedEvents)
        rawRepository.markProcessed(unprocessed.map { it.id!! }.toSet())

        logger.info("Normalization complete: ${unprocessed.size} normalize, " +
                "${unprocessed.size - normalizedEvents.size} skipped")
    }
}
