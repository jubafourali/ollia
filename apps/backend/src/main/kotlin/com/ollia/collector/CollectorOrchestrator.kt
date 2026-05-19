package com.ollia.collector

import com.ollia.entity.CollectorCheckpoint
import com.ollia.repository.CollectorCheckpointRepository
import com.ollia.repository.RawSafetySignalRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.Instant

@Service
class CollectorOrchestrator(
    private val collectors: List<SafetyCollector>,
    private val rawRepository: RawSafetySignalRepository,
    private val checkpointRepository: CollectorCheckpointRepository
) {

    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedRate = 300_000)
    fun collect() {

        logger.info("Starting safety collection")

        collectors.parallelStream().forEach { collector ->

            try {
                logger.info(
                    "Running collector ${collector.source}"
                )

                val signals = collector.collect()

                rawRepository.saveAll(signals)

                checkpointRepository.save(
                    CollectorCheckpoint(
                        source = collector.source.name,
                        lastFetchedAt = Instant.now(),
                        status = "SUCCESS",
                    )
                )

                logger.info(
                    "${collector.source} completed with ${signals.size} signals"
                )

            } catch (e: Exception) {

                logger.error(
                    "${collector.source} failed",
                    e
                )

                checkpointRepository.save(
                    CollectorCheckpoint(
                        source = collector.source.name,
                        lastFetchedAt = Instant.now(),
                        status = "FAILED"
                    )
                )
            }
        }
    }
}