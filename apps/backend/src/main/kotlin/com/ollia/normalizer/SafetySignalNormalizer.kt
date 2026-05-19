package com.ollia.normalizer

import com.ollia.entity.NormalizedSafetyEvent
import com.ollia.entity.RawSafetyEvent

interface SafetySignalNormalizer {
    fun canHandle(raw: RawSafetyEvent): Boolean
    fun normalize(raw: RawSafetyEvent): NormalizedSafetyEvent?
}
