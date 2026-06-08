package com.ollia.saiae.police

import com.ollia.entity.SourceType

/** Maps the ingestion-side SourceType enum onto saiae_source_registry primary keys. */
object SourceRegistryMapping {
    fun registryId(sourceType: SourceType): String = when (sourceType) {
        SourceType.USGS             -> "usgs"
        SourceType.NOAA             -> "noaa"
        SourceType.GDACS            -> "gdacs"
        SourceType.REUTERS          -> "reuters"
        SourceType.BBC              -> "bbc"
        SourceType.GDELT            -> "gdelt"
        SourceType.NEWSDATA         -> "newsdata"
        SourceType.GOVERNMENT_ALERT -> "government"
        SourceType.POLICE_FEED      -> "police"
        else                        -> "local_media"
    }
}