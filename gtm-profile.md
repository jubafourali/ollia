# GTM Profile — Ollia
Last updated: 2026-07-15 by gtm-orchestrator

## Product
Family reassurance app: quiet presence (check-ins / activity signals / escalation when someone goes quiet) + verified major place hazards near loved ones. Explicitly NOT location tracking, crime desk, or street news. Live / shipping (Expo + Spring Boot), premium via RevenueCat.

## Category & Business Model
Consumer app → aspire to own **family reassurance** (not family tracking). Revenue: freemium subscription (circle size + escalation / comfort features).

## Motion
Primary: consumer/viral (invite loop inside a circle)
Secondary: community-led (diaspora / long-distance family communities)
Rationale: value only appears when ≥2 people use it; ACV is consumer; product must sell itself via “I’m okay” loop, not sales demos.

## ICP / Target user
1. **Worrier abroad / distant** — parent or sibling who cannot live-track without resentment (France↔Maghreb / Gulf diaspora is product ICP pack)
2. **Watched person** — wants to reassure without sharing GPS
3. Avoid as beachhead: US teen-driver / parental control families (Life360 owns that)

## Positioning (one-liner)
For long-distance families who want peace of mind without surveillance, Ollia is the family reassurance app that proves loved ones are okay — and when major verified hazards hit near them, quietly surfaces that — unlike Life360 / Find My which track where you are.

## Stage & Goals
Stage: first customers / activation focus
North-star: surviving activated circles (see `analytics/metrics.md`)
90-day goal: prove one beachhead where check-in + calm Nearby beats “just text me” and beats location apps on trust.

## Channels in play
- App Store / organic search (category: reassurance, not tracker)
- Invite share (primary growth loop)
- Diaspora / family communities (secondary)
- Content: deferred until messaging locked

## Stack & Connectors
PostHog EU (planned), Clerk, RevenueCat, Railway, Météo-France (gated)

## Decisions log
- 2026-07-15: Own **reassurance**, not tracking — quiet = instruments checked, not omniscience (`docs/SAFETY_SOURCES.md`)
- 2026-07-15: Beachhead = long-distance / diaspora families, not teen GPS
- 2026-07-15: Reassurance spine — quiet = checked; Help is real; one silence ladder; emergency = circle gets phone to call
- 2026-07-16: Activation aha = `reassurance_state_viewed` (Worrier sees loved one's state), not mere activity signal (`analytics/metrics.md`)
