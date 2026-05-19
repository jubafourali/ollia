package com.ollia.normalizer

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
        val unprocessed = rawRepository.findAllUnprocessed()
        if (unprocessed.isEmpty()) return

        logger.info("Normalizing ${unprocessed.size} raw signals")
        var normalized = 0
        var skipped = 0

        for (raw in unprocessed) {
            try {
                val normalizer = normalizers.firstOrNull { it.canHandle(raw) }
                if (normalizer == null) {
                    logger.debug("No normalizer for source ${raw.source} — skipping")
                    rawRepository.markProcessed(raw.id!!)
                    skipped++
                    continue
                }

                val event = normalizer.normalize(raw)
                if (event != null) {
                    normalizedRepository.save(event)
                    normalized++
                }
                rawRepository.markProcessed(raw.id!!)
            } catch (e: Exception) {
                logger.error("Failed to normalize raw signal ${raw.id}", e)
            }
        }

        logger.info("Normalization complete: $normalized saved, $skipped skipped")
    }
}
