package com.ollia.entity

enum class ConfidenceTier {
    HIGH,       // 75–95
    MODERATE,   // 50–74
    LOW,        // 40–49
    BLOCKED     // 0–39 — never surfaced
}