# Metrics Architecture — Ollia

Owner: gtm-analytics · Date: 2026-07-16 · Motion: consumer/viral + community-led · North-star: surviving activated circles

Measurement principle: privacy-first. Instrument **loop events** (not location). Attribute channels via promo links / store custom product pages / install referrer — no fingerprinting.

## Stack

- **Product analytics:** PostHog **EU Cloud** (`https://eu.i.posthog.com`) or self-host — matches privacy brand.
- Env: `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` (default EU).
- Channel attribution: deep-link / install URL `?channel=` or `?utm_source=` → stored as `source_channel`.

## P0.1 event contract

Shared properties on every event: `{ source_channel, circle_id, role: "worrier"|"watched" }`

| Event | Fires when | Role typical |
|---|---|---|
| `circle_created` | Installer creates a Family Circle | worrier |
| `invite_sent` | ≥1 invite generated/shared | worrier |
| `invite_accepted` | ★ Invited person joins (loop kill-point) | watched |
| `reassurance_state_viewed` | ★ Worrier opens the app and sees a loved one's reassurance state (the aha — required for activation, NOT just a signal existing) | worrier |
| `circle_activated` | ★ ≥2 members AND a `reassurance_state_viewed` has fired for the Worrier | worrier (once per circle) |
| `heartbeat` | Manual "I'm okay" tap | either |

Deferred (revenue phase): `trial_started`, `subscribed`.

## Derived: `active_7d` (north-star cohort)

Not a client-fired event. Build in PostHog:

1. Cohort / retention: persons (or circle_id groups) who fired `circle_activated`
2. Still show **unprompted** activity at day 7+ — any of: `heartbeat`, or server-side passive signal proxied later
3. North-star unit = count of distinct `circle_id` in that set (**Surviving Activated Circles**)

Suggested HogQL sketch:

```sql
SELECT count(DISTINCT circle_id) AS surviving_activated_circles
FROM events
WHERE event = 'heartbeat'
  AND timestamp >= now() - INTERVAL 7 DAY
  AND circle_id IN (
    SELECT DISTINCT properties.circle_id
    FROM events
    WHERE event = 'circle_activated'
      AND timestamp <= now() - INTERVAL 7 DAY
  )
```

Tune once production volume exists (person vs circle grouping, unprompted definition).

## Funnel stages (organic cohort)

| # | Stage | Event / query | Target |
|---|---|---|---|
| 1 | Circle created | `circle_created` | ≥60% of installs |
| 2 | Invite sent | `invite_sent` | ≥80% of creators |
| 3 | ★ Invite accepted | `invite_accepted` | ≥50% of invites |
| 4 | ★ Reassurance viewed | `reassurance_state_viewed` | ≥40% of creators with ≥1 join |
| 5 | Circle activated | `circle_activated` | ≥30% of installs |
| 6 | ★ D7 survival | derived `active_7d` cohort | ≥40% of activated |
| 7 | Free→Premium | later | ~3% of installs |

## Implementation map (mobile)

| Event | Hook |
|---|---|
| `circle_created` | `FamilyContext.setupCircle` after `api.createCircle` |
| `invite_sent` | `onboarding/invite` + `InviteModal` after Share |
| `invite_accepted` | `invite.tsx` / `join.tsx` after `api.joinCircle` |
| `reassurance_state_viewed` | Family tab (`(tabs)/index`) when Worrier sees ≥1 peer; also `member/[id]` |
| `circle_activated` | After reassurance viewed + `memberCount ≥ 2` (deduped); re-checked on `refreshCircle` |
| `heartbeat` | `my-status` manual tap only |
| `active_7d` | PostHog cohort / HogQL — not client-fired |
