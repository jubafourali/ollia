package com.ollia.collector

import com.ollia.entity.RawSafetyEvent
import com.ollia.entity.SourceType

interface SafetyCollector {
    val source: SourceType

    fun collect(): List<RawSafetyEvent>
}
