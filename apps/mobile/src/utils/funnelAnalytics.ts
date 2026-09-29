import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPostHogEnabled, posthog } from "@/config/posthog";

// Client-observed milestones, not authoritative billing or circle-level cohorts.
const DAY = 24 * 60 * 60 * 1000;
let userId: string | null = null;
let pending: Promise<void> = Promise.resolve();

export function setFunnelAnalyticsUser(id: string | null) {
  userId = id;
}

// Serialize read/capture/write so concurrent renders cannot duplicate milestones.
// Analytics must never prevent sign-in or a manual check-in.
function safely(task: () => Promise<void>): Promise<void> {
  pending = pending.then(task).catch(() => {});
  return pending;
}

type SignupResult = { status: string | null; createdUserId: string | null; createdSessionId: string | null };

// Clerk resources are mutable; retain the completed result before activating a session.
export function signupSnapshot(signup: SignupResult | undefined): SignupResult | undefined {
  return signup ? { status: signup.status, createdUserId: signup.createdUserId, createdSessionId: signup.createdSessionId } : undefined;
}

export function trackAccountCreated(
  signup: SignupResult | undefined,
  activeSessionId: string | null,
): Promise<void> {
  if (!isPostHogEnabled || signup?.status !== "complete" || !signup.createdUserId ||
      !activeSessionId || signup.createdSessionId !== activeSessionId) return Promise.resolve();
  const id = signup.createdUserId;
  return safely(async () => {
    const key = `@ollia_account_created:${id}`;
    if (await AsyncStorage.getItem(key)) return;
    if (userId && userId !== id) return;
    posthog.identify(id);
    posthog.capture("account_created", { measurement_version: 1 });
    await AsyncStorage.setItem(key, "true");
  });
}

export function recordObservedActivation(circleId: string): Promise<void> {
  const id = userId;
  if (!isPostHogEnabled || !id || !circleId) return Promise.resolve();
  return safely(async () => {
    const key = `@ollia_activation_time_v1:${id}:${circleId}`;
    if (await AsyncStorage.getItem(key)) return;
    await AsyncStorage.setItem(key, String(Date.now()));
  });
}

/** Same activated owner + circle, manual heartbeat 7–13 days after observed activation.
 * No timestamp backfill for existing circles; missing evidence remains unknown.
 * Local persistence cannot guarantee deduplication across reinstalls or devices.
 */
export function trackActivatedReturn(circleId: string): Promise<void> {
  const id = userId;
  if (!isPostHogEnabled || !id || !circleId) return Promise.resolve();
  return safely(async () => {
    const key = `@ollia_activation_time_v1:${id}:${circleId}`;
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return;
    const activatedAt = Number(stored);
    const elapsed = Date.now() - activatedAt;
    if (!Number.isFinite(activatedAt) || elapsed < 7 * DAY || elapsed >= 14 * DAY) return;
    const sentKey = `${key}:returned`;
    if (await AsyncStorage.getItem(sentKey)) return;
    // Do not let a queued event cross an account switch.
    if (userId !== id) return;
    posthog.capture("activated_user_returned_7d", {
      circle_id: circleId,
      return_action: "manual_heartbeat",
      days_since_activation: Math.floor(elapsed / DAY),
      measurement_version: 1,
    });
    await AsyncStorage.setItem(sentKey, "true");
  });
}
