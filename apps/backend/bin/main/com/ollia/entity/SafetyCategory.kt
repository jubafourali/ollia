package com.ollia.entity

enum class SafetyCategory {

    // Natural disasters
    EARTHQUAKE,
    FLOOD,
    WILDFIRE,
    TSUNAMI,
    HURRICANE,
    TORNADO,
    STORM,
    VOLCANO,
    DROUGHT,
    EXTREME_WEATHER,
    LANDSLIDE,
    AVALANCHE,

    // Conflict & security
    WAR,
    ARMED_CONFLICT,
    MISSILE_ATTACK,
    TERRORISM,
    EXPLOSION,
    ACTIVE_SHOOTER,
    VIOLENCE,
    KIDNAPPING,
    CIVIL_UNREST,
    PROTEST,
    RIOT,
    BORDER_TENSION,
    CURFEW,

    // Public health
    EPIDEMIC,
    PANDEMIC,
    HEALTH_ALERT,
    FOOD_CONTAMINATION,

    // Infrastructure & transport
    AIRPORT_DISRUPTION,
    TRANSPORT_DISRUPTION,
    MASS_CANCELLATION,
    PORT_DISRUPTION,
    BLACKOUT,
    INTERNET_OUTAGE,
    WATER_SHORTAGE,

    // Government / geopolitical
    GOVERNMENT_ADVISORY,
    STATE_OF_EMERGENCY,
    EVACUATION_ORDER,
    TRAVEL_RESTRICTION,
    VISA_DISRUPTION,

    // Crime & local safety
    HIGH_CRIME_ALERT,
    SCAM_ALERT,
    TOURIST_TARGETING,

    // Fallback
    OTHER
}