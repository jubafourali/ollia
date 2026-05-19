package com.ollia.entity

enum class SourceType(
    val trustScore: Int, val type: SourceKind, val requiresVerification: Boolean
) {
    USGS(95, SourceKind.DISASTER_AGENCY, false),

    NOAA(95, SourceKind.GOVERNMENT, false),

    GDACS(90, SourceKind.DISASTER_AGENCY, false),

    REUTERS(90, SourceKind.NEWS, true),

    BBC(88, SourceKind.NEWS, true),

    GDELT(75, SourceKind.AGGREGATOR, true),

    NEWS_API(70, SourceKind.AGGREGATOR, true),

    GOVERNMENT_ALERT(95, SourceKind.GOVERNMENT, false),

    POLICE_FEED(92, SourceKind.POLICE, false)
}