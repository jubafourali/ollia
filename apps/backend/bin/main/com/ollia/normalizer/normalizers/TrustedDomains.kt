package com.ollia.normalizer.normalizers

import com.ollia.entity.SourceType

/**
 * Re-attributes aggregator-sourced articles (GDELT, NewsData) to the underlying
 * trusted wire/outlet when the article URL is from a known domain. This turns data
 * we already collect into properly-weighted independent origins: a Reuters article
 * and an AP article about the same event become two T1 sources that corroborate,
 * instead of two generic "aggregator" rows.
 */
object TrustedDomains {

    fun attribute(fallback: SourceType, url: String?): SourceType {
        val u = url?.lowercase() ?: return fallback
        return when {
            "reuters.com" in u                       -> SourceType.REUTERS
            "apnews.com" in u || "ap.org" in u       -> SourceType.AP
            "bbc.co.uk" in u || "bbc.com" in u       -> SourceType.BBC
            else                                      -> fallback
        }
    }
}