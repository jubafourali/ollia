# Ollia safety sources — what we sell vs what we have

**Last revised:** 2026-07-15  
**Product promise (locked) — this is the ONLY “100%” we chase:**  
*When something major and verified happens near the people you love, Ollia usually catches it from trustworthy sources. Quiet means those sources were checked — not that nothing happened on earth.*

**Not the goal:** 100% of everything on every street (crime, gossip, RATP, WhatsApp). That is impossible and would destroy trust.

Use this file for marketing, sales, App Store, and founder edits.  
If copy in the app and this doc disagree, **this doc wins** until you update both.

---

## Path to 100% of the locked claim

| Slice of the promise | Target | Status now |
|---|---|---|
| Major disasters (quake / cyclone / big flood / wildfire) | Never miss GDACS/USGS-scale | **Strong** |
| Serious standing advisories | Score ≥ 2.5 surfaced | **Stronger** (was 3.0) |
| Europe severe weather | MeteoAlarm orange+ | **Good** |
| France national vigilance | Météo-France DP Vigilance | **Wired** — turn on with API key |
| Gulf / Maghreb extremes | Open-Meteo heat/wind/storm (lower thresholds) | **Stronger** |
| UAE NCM / Algeria ONM full CAP | Official national feed | **Blocked** — public CAP hub feeds are dead/junk; need partnership or scrape later |
| Live “being there” conditions | Temp, wind, AQI, UV, precip, **pollen, dust, holidays** | **Stronger** |
| Crime / street / protests | Never claim | **Correctly out** |
| **Person reassurance stack** | I'm OK + phone murmur + Help + one silence ladder + last-resort phone to circle | **Wired 2026-07-15** |

**Founder action to spike France to “nation-grade”:**  
1. Create free account at https://portail-api.meteofrance.fr/  
2. Subscribe to **DonneesPubliquesVigilance**  
3. Set `METEO_FRANCE_API_KEY` (portal JWT starting with `eyJ…`) and `OLLIA_COLLECTORS_METEOFRANCE_ENABLED=true`

---

## Status legend

| Status | Meaning |
|---|---|
| **LIVE** | Collector runs; Police can verify; users can see matching events |
| **LIVE (gated)** | Code live behind env flag / API key |
| **LIVE (thin)** | Running but narrow |
| **OFF** | Disabled by default |
| **BLOCKED** | Wanted but no trustworthy public feed yet |
| **OUT OF SCOPE** | Do not sell |

---

## Situation vs alerts (Nearby)

| Layer | What it is | Sell as |
|---|---|---|
| **Situation** | Live Open-Meteo: temp, wind, humidity, **AQI**, **UV**, **pollen**, **dust**, precip + **public holidays** (Nager) | How it feels / what’s on in the city |
| **Verified alerts** | Instrument pipeline | Major verified hazards |
| **Coverage pack** | Collapsed list of instruments + gaps | Trust / calibration |

### City depth (in scope vs out)

**In scope (instrument / calendar):** weather extremes, air quality, pollen (EU-strong), dust/sand (Gulf/Maghreb), heat feel, national public holidays.  
**Out of scope:** crime desks, street gossip, metro/RATP, protest-from-news, WhatsApp rumors. Depth ≠ omniscience.

---

## Active pipeline (default production)

Orchestrator ~every **5 minutes**. News **off**.

| Source | Status | Catches | Sell as |
|---|---|---|---|
| **USGS** | LIVE | Global quakes | Global quakes |
| **GDACS** | LIVE | Large disasters | Major disasters worldwide |
| **NOAA** | LIVE | US Extreme/Severe weather | **US only** |
| **GOVERNMENT_ALERT** | LIVE | Travel advisories ≥ **2.5** | Elevated+ national advisories |
| **METEOALARM** | LIVE | EUMETNET Atom (EU incl. France) | European severe weather |
| **OPEN_METEO** | LIVE | Hub extremes; **hotter regions use lower heat/wind bars** | Extreme-condition probe |
| **METEO_FRANCE** | **LIVE (gated)** | Official FR departmental vigilance | Nation-grade France — **enable with key** |
| **GDELT / NewsData** | OFF | News aggregators | Do not sell |

### Dead ends (do not wire again without validation)
- `cap-sources.s3.amazonaws.com/ae-ncm-en` and `dz-meteo-*` — stale polluted feeds (2011–2015 non-UAE/DZ junk). Treat as **BLOCKED**.

---

## ICP packs

### France
**Check:** USGS, GDACS, GOVERNMENT_ALERT, METEOALARM, METEO_FRANCE (when on), OPEN_METEO  
**Do not claim:** crime, street, metro/RATP, rumors  

### Algeria / UAE
**Check:** USGS, GDACS, GOVERNMENT_ALERT, OPEN_METEO (region-tuned heat/wind)  
**Do not claim:** full ONM / NCM CAP until a live official feed exists  
**Blocked next:** partnership or reverse-engineer live NCM/ONM endpoints — never trust Alert-Hub ghosts  

---

## Honest sell lines

**Yes:** major verified hazards; quiet = instruments checked; live conditions for the place; France vigilance with key.  
**No:** everything around them; all clear forever; crime desk; dead CAP hubs as “coverage.”

---

## Code map

| Concern | Where |
|---|---|
| Situation (AQ/UV/precip) | `PlaceSituationService.kt` |
| Collectors | `collector/collectors/` |
| Météo-France gate | `ollia.collectors.meteofrance.enabled` + `meteofrance.api-key` |
| News off | `ollia.collectors.news.enabled=false` |
| Registry | Flyway V24, V29, V36, **V37** |
| Coverage packs | `CoveragePolicy.kt` |
| Sources of truth doc | **this file** |

---

## Revision log

| Date | Change |
|---|---|
| 2026-07-15 | Initial doc |
| 2026-07-15 | Situation layer; Nearby UX tighten |
| 2026-07-15 | **Go big:** AQ/UV/precip situation; advisories ≥2.5; Gulf/Maghreb heat thresholds; Météo-France vigilance collector (gated); CAP hub AE/DZ marked blocked |
| 2026-07-15 | **City depth:** pollen + dust + holiday knowledge on situation layer (not news/crime) |
