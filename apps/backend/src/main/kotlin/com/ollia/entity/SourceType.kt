package com.ollia.entity

/**
 * Drop-in replacement for existing SourceType.kt — adds GDELT and NEWSDATA.
 * Existing entries unchanged. trustScore values match SAIAE source tier weights
 * (T1 instrument = 95, T1 news = 85-90, T2 news = 80, T3 aggregator = 70).
 */
enum class SourceType(
    val trustScore: Int,
    val type: SourceKind,
    val requiresVerification: Boolean
) {
    USGS(95, SourceKind.DISASTER_AGENCY, false),

    /** Météo-France DP Vigilance (official FR departmental alerts). Requires API key. */
    METEO_FRANCE(96, SourceKind.GOVERNMENT, false),

    NOAA(95, SourceKind.GOVERNMENT, false),

    /** Météo-Alarm / EUMETNET CAP — European severe weather warnings. */
    METEOALARM(94, SourceKind.GOVERNMENT, false),

    /**
     * Open-Meteo extreme conditions for diaspora hubs outside NOAA coverage
     * (heat / wind / storm thresholds derived from WMO-style weather codes).
     */
    OPEN_METEO(90, SourceKind.DISASTER_AGENCY, false),

    GDACS(90, SourceKind.DISASTER_AGENCY, false),

    REUTERS(90, SourceKind.NEWS, true),

    AP(90, SourceKind.NEWS, true),

    BBC(88, SourceKind.NEWS, true),

    // ── Added for SAIAE v1 multi-source coverage ──────────────────────────────
    /**
     * GDELT Project — global news event monitoring across 100+ languages.
     * Real-time, free, no API key. Covers conflict, terrorism, civil unrest,
     * protests. Treat as T1 aggregator (high trust, breadth-focused).
     */
    GDELT(85, SourceKind.AGGREGATOR, true),

    /**
     * NewsData.io — free tier news aggregator. Filters by country + category.
     * Returns structured JSON, lower latency than GDELT but smaller breadth.
     * Treat as T2 news.
     */
    NEWSDATA(80, SourceKind.NEWS, true),
    // ──────────────────────────────────────────────────────────────────────────

    NEWS_API(70, SourceKind.AGGREGATOR, true),

    GOVERNMENT_ALERT(95, SourceKind.GOVERNMENT, false),

    POLICE_FEED(92, SourceKind.POLICE, false)
}