package com.ollia.dto

/**
 * Region-scoped safety feed for the "Nearby" screen.
 *
 * Unlike [NearbyMemberResponse] (grouped per circle member), this answers
 * "what's happening around *this place* right now?" for an arbitrary region the
 * user is browsing. The banner reads [worstRisk] + [summary]; the feed reads [events].
 */
data class NearbyRegionResponse(
    val region:    String,
    val worstRisk: String,   // NORMAL | STAY_AWARE | IMPORTANT_DISRUPTION
    val summary:   String,   // calm smart-summary sentence for the safety banner
    val events:    List<NearbyEventResponse>,
)