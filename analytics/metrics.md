# Metrics Architecture — Ollia

Owner: gtm-analytics · Date: 2026-07-16 · Motion: consumer/viral + community-led · North-star: surviving activated circles

Measurement principle: privacy-first. Instrument **loop events** (not location). Attribute channels via promo links / store custom product pages / install referrer — no fingerprinting.

## Stack

- **Product analytics:** PostHog **US Cloud** (`https://us.i.posthog.com`), Ollia organization, project **632787** (Default project), matching Ollia's read-only connection in Juba.
- Env: `EXPO_PUBLIC_POSTHOG_KEY` (public ingestion token), `EXPO_PUBLIC_POSTHOG_HOST`. Both must be explicit; there is no implicit region fallback. Keep the token/host pair together in both EAS configuration files. Never put a personal or secret read-access API key in the app.
- This corrects the previous EU destination and different project token. It affects new builds only; existing installations keep their bundled configuration until updated. No historical analytics migration is performed.
- Channel attribution: deep-link / install URL `?channel=` or `?utm_source=` → stored as `source_channel`.
- **GTM outcomes (server):** [Juba](https://app.getjuba.com) ingest from the Spring backend only (`JubaAnalyticsClient`). Never put `JUBA_INGEST_KEY` in the mobile app. PostHog remains the client product-analytics spine; Juba receives authoritative loop outcomes (e.g. `invite_accepted` → `customer_acquired`).

Env (Railway / local): `JUBA_INGEST_KEY` (required to send), optional `JUBA_INGEST_URL`, `JUBA_SOURCE_ID` (defaults match the Ollia production HTTP source).

If the ingest key is ever pasted into chat or committed, rotate it in Juba and update Railway — Juba stores only a hash.

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

## Implementation map (server → Juba)

| Product event | Juba `eventName` | Hook |
|---|---|---|
| `invite_accepted` | `customer_acquired` (`sourceEvent=invite_accepted`) | `ReferenceApiController.joinCircle` after new membership save |

Idempotency: `externalId` = `invite_accepted:{circleId}:{userId}`. No-op when `JUBA_INGEST_KEY` is blank.

## Juba connection verification (2026-09-28)

- Juba reads US project `632787` through its existing restricted read-only key.
- The SDK public token and US ingestion host are paired in both EAS files. Missing
  host/token disables collection rather than choosing a region implicitly.
- Run `npm run test:analytics --workspace apps/mobile` from the repository root.
  These tests stub the SDK and send no analytics.
- An iOS Expo export passed with the configured US host and intended public token
  embedded in the Hermes bundle; the old token is absent.
- For live verification, launch a newly built app and confirm its SDK-generated
  `Application Opened` event in PostHog before mapping it to Juba's Visitors step.
  This represents app users, not website traffic. Keep Signups and Retained blank:
  the current event contract does not establish those counts. Do not map circle
  creation to account signup or a heartbeat to seven-day retention.
- A simulator/owner rehearsal event is test activity, not evidence of customer
  acquisition. Do not send synthetic events and claim they came from an app.
- Existing installs need an updated binary. This repository has no configured
  EAS Update runtime/channel, so changing source files does not update store apps.
- Live verification passed on an iPhone 16e / iOS 26 simulator with a native
  Debug build. PostHog's activity view for project `632787` showed 11 events,
  including `Application Installed`, `Application Opened`, `Screen`,
  `Application Backgrounded`, and `Application Became Active`, from
  `posthog-react-native`. Initial network failures recovered; queued events arrived.
  This is simulator test traffic, not a production-user or signup measurement.
- Juba's event mapping and sync passed after Railway connectivity recovered.
  The existing encrypted read-only key was reused through the connection service;
  `Application Opened` maps to Visitors, with signup/retention left unmapped.
  Sync `87066394-84f5-4dd5-b145-386c92ccf2d6` completed with 30 daily readings.
  Overview shows 1 visitor for both the last seven days and four weeks, alongside
  RevenueCat USD 0.00. That visitor is the simulator rehearsal, not customer growth.
  A subsequent PostHog aggregate query returned seven events (one app open);
  the earlier activity-view row count is not a unique-visitor measurement.
- The native Debug build and the three analytics configuration tests passed.
  The full mobile TypeScript check still reports eight errors in untouched
  onboarding, invite, UpgradeModal, and presence code; this is not full app
  release certification. Android and store distribution remain untested here.

## Signup and D7 return instrumentation — September 29, 2026

Activation is now mapped in Juba: `circle_activated` → Activated users. Its
count is distinct observed owners per day, not distinct circles or newly acquired
customers. The September 29 test sync produced one activation; this is owner
TestFlight traffic. Visitors remain daily distinct persons with app-open events.
Neither the displayed ratio nor the aggregated daily counts establish a customer
conversion rate or a cohort survival rate.

The next mobile build adds these events:

| Event | Exact contract | Juba mapping after live verification |
| --- | --- | --- |
| `account_created` | A completed Clerk signup with a created user and the same session successfully activated. Email verification and Apple/Google SSO paths on both normal and invite routes. Existing login, reinstall and circle creation do not qualify. | Signups |
| `activated_user_returned_7d` | Same identified owner and circle, manual heartbeat at elapsed time ≥7 days and <14 days after activation observed by this instrumented build. | Retained (D7 manual-return proxy) |

Signup uses Clerk's [completed signup result](https://clerk.com/docs/expo/reference/objects/sign-up),
not the age of a cached profile. A snapshot is taken before activating the session.
No email, authentication token or session ID is sent as event properties.

The return event is a **person-level proxy**, separate from the `active_7d`
circle-level north star above. A manual heartbeat does not prove it was unprompted.
Activation dates are not backfilled from existing local flags. An existing circle
with no observed activation timestamp therefore remains ineligible for this
client-side return measurement. Local deduplication does not guarantee exact-once
measurement across devices or reinstalls. Analytics/storage failures cannot block
authentication or check-ins. Client delivery can still be interrupted or disabled;
a server-derived cohort remains preferable for audited retention rates.

Release verification:

1. Ship this branch in a new TestFlight build; build 54 does not contain these events.
2. Create a new test account through email verification; confirm `account_created`
   in PostHog, then sign out/in and confirm no additional signup. Repeat with a
   fresh Apple/Google SSO account and the invite route where available.
3. With that identified owner, activate a new test circle (joined loved one +
   reassurance viewed). Confirm `circle_activated` and preserve the installation.
4. The same owner sends a manual check-in in that circle 7–13 days later. Confirm
   `activated_user_returned_7d`; another check-in must not emit it again. Do not
   alter clocks or send synthetic production events to claim this live check.
5. Only after the corresponding event is observed, map it in Juba and sync.
   Keep unverified steps unmapped/unknown; zero is not evidence of missing setup.

Validation: 13 analytics checks pass, including concurrent callbacks, stale SSO
results, incomplete signup, account/circle separation, elapsed-time bounds,
missing/corrupt timestamps, disabled analytics, storage failure, and hook guards.
An iOS Expo export passes. The full TypeScript check still has the eight existing
errors in family/onboarding/invite/UpgradeModal/presence code; no new funnel
instrumentation type error was reported. This is not an Android or native release
build certification.
