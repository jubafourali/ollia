package com.ollia.entity

enum class EventStatus {
    PENDING_VERIFICATION,
    VERIFIED,
    REJECTED,
    EXPIRED,
    MERGED      // folded into a canonical sibling event by the correlation step
}