import AsyncStorage from "@react-native-async-storage/async-storage";
import { posthog } from "@/config/posthog";

/**
 * P0.1 measurement spine — event names are an analytics contract.
 * Full definitions: analytics/metrics.md
 *
 * Shared props on every event: { source_channel, circle_id, role }
 * active_7d is derived in PostHog (not client-fired).
 */
export const AnalyticsEvents = {
  CIRCLE_CREATED: "circle_created",
  INVITE_SENT: "invite_sent",
  INVITE_ACCEPTED: "invite_accepted",
  /** ★ Worrier sees a loved one's reassurance state (the aha). */
  REASSURANCE_STATE_VIEWED: "reassurance_state_viewed",
  /** ★ ≥2 members AND reassurance_state_viewed for the Worrier. */
  CIRCLE_ACTIVATED: "circle_activated",
  HEARTBEAT: "heartbeat",
} as const;

export type AnalyticsRole = "worrier" | "watched";

export type CoreEventProperties = {
  source_channel: string;
  circle_id: string;
  role: AnalyticsRole;
};

const SOURCE_CHANNEL_KEY = "@ollia_source_channel";
const CIRCLE_ROLE_KEY = "@ollia_analytics_role";
const CIRCLE_ACTIVATED_KEY = "@ollia_circle_activated";
const REASSURANCE_VIEWED_KEY = "@ollia_reassurance_state_viewed";

let cachedChannel: string | null = null;
let cachedRole: AnalyticsRole | null = null;

export async function initSourceChannelFromUrl(url: string | null | undefined) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    const channel =
      parsed.searchParams.get("channel") ||
      parsed.searchParams.get("utm_source") ||
      parsed.searchParams.get("source");
    if (channel?.trim()) {
      await setSourceChannel(channel.trim().toLowerCase());
    }
  } catch {
    // non-URL deep links are ignored
  }
}

export async function setSourceChannel(channel: string) {
  cachedChannel = channel;
  await AsyncStorage.setItem(SOURCE_CHANNEL_KEY, channel);
  posthog.register({ source_channel: channel });
}

export async function getSourceChannel(): Promise<string> {
  if (cachedChannel) return cachedChannel;
  const stored = await AsyncStorage.getItem(SOURCE_CHANNEL_KEY);
  cachedChannel = stored?.trim() || "unknown";
  return cachedChannel;
}

export async function setAnalyticsRole(role: AnalyticsRole) {
  cachedRole = role;
  await AsyncStorage.setItem(CIRCLE_ROLE_KEY, role);
  posthog.register({ role });
}

export async function getAnalyticsRole(): Promise<AnalyticsRole> {
  if (cachedRole) return cachedRole;
  const stored = await AsyncStorage.getItem(CIRCLE_ROLE_KEY);
  cachedRole = stored === "watched" ? "watched" : "worrier";
  return cachedRole;
}

async function coreProps(circleId: string): Promise<CoreEventProperties> {
  const [source_channel, role] = await Promise.all([
    getSourceChannel(),
    getAnalyticsRole(),
  ]);
  return { source_channel, circle_id: circleId, role };
}

function reassuranceFlagKey(circleId: string) {
  return `${REASSURANCE_VIEWED_KEY}:${circleId}`;
}

function activatedFlagKey(circleId: string) {
  return `${CIRCLE_ACTIVATED_KEY}:${circleId}`;
}

export async function hasReassuranceStateViewed(circleId: string): Promise<boolean> {
  if (!circleId) return false;
  try {
    return (await AsyncStorage.getItem(reassuranceFlagKey(circleId))) === "true";
  } catch {
    return false;
  }
}

export function identifyUser(
  userId: string,
  properties?: Record<string, string | number | boolean | null>,
) {
  if (!userId) return;
  posthog.identify(userId, properties);
}

export async function resetAnalytics() {
  cachedChannel = null;
  cachedRole = null;
  posthog.reset();
}

export async function trackCircleCreated(circleId: string) {
  await setAnalyticsRole("worrier");
  posthog.capture(AnalyticsEvents.CIRCLE_CREATED, await coreProps(circleId));
}

export async function trackInviteSent(circleId: string) {
  posthog.capture(AnalyticsEvents.INVITE_SENT, await coreProps(circleId));
}

export async function trackInviteAccepted(circleId: string) {
  await setAnalyticsRole("watched");
  posthog.capture(AnalyticsEvents.INVITE_ACCEPTED, await coreProps(circleId));
}

/**
 * ★ Aha moment: Worrier opens Family and sees a loved one's reassurance state.
 * Deduped once per circle. Then attempts circle_activated.
 */
export async function trackReassuranceStateViewed(opts: {
  circleId: string;
  /** Loved one whose state is on screen (not self). */
  memberId?: string;
  memberCount: number;
}) {
  const { circleId, memberId, memberCount } = opts;
  if (!circleId) return;

  const role = await getAnalyticsRole();
  if (role !== "worrier") return;

  const flagKey = reassuranceFlagKey(circleId);
  try {
    const already = await AsyncStorage.getItem(flagKey);
    if (already === "true") {
      // Still try activation in case members crossed ≥2 after first view.
      await maybeTrackCircleActivated({ circleId, memberCount });
      return;
    }
    await AsyncStorage.setItem(flagKey, "true");
  } catch {
    return;
  }

  const props = await coreProps(circleId);
  posthog.capture(AnalyticsEvents.REASSURANCE_STATE_VIEWED, {
    ...props,
    ...(memberId ? { member_id: memberId } : {}),
  });

  await maybeTrackCircleActivated({ circleId, memberCount });
}

/**
 * ★ Activation: ≥2 members AND Worrier has viewed reassurance state.
 * Fires once per circle (local dedupe).
 */
export async function maybeTrackCircleActivated(opts: {
  circleId: string;
  memberCount: number;
}) {
  const { circleId, memberCount } = opts;
  if (!circleId || memberCount < 2) return;

  const role = await getAnalyticsRole();
  if (role !== "worrier") return;

  if (!(await hasReassuranceStateViewed(circleId))) return;

  const flagKey = activatedFlagKey(circleId);
  try {
    const already = await AsyncStorage.getItem(flagKey);
    if (already === "true") return;
    await AsyncStorage.setItem(flagKey, "true");
  } catch {
    return;
  }

  posthog.capture(AnalyticsEvents.CIRCLE_ACTIVATED, await coreProps(circleId));
}

/** Manual "I'm okay" tap only — not automatic/background/passive signals. */
export async function trackHeartbeat(circleId: string) {
  posthog.capture(AnalyticsEvents.HEARTBEAT, await coreProps(circleId));
}
