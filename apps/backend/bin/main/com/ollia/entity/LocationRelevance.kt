package com.ollia.entity

enum class LocationRelevance {
    SAME_CITY,
    SAME_COUNTRY,
    BORDER_REGION,   // different country but within 200km of border
    DISTANT,
    UNKNOWN
}