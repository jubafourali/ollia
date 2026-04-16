/**
 * Passive background activity detection for iOS.
 *
 * Uses two complementary wake strategies:
 *   1. Background Fetch — iOS schedules periodic wakes (~15-60 min).
 *   2. Significant Location Changes — iOS wakes the app on cell-tower
 *      handoffs (~500 m movement). NO coordinates are stored or sent;
 *      the event is used purely as a trigger.
 *
 * Both strategies call POST /api/activity with signalType "background".
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ── Task names ──────────────────────────────────────────────────────
const BG_FETCH_TASK = "ollia-background-heartbeat";
const BG_LOCATION_TASK = "ollia-location-trigger";

// ── AsyncStorage / SecureStore keys ─────────────────────────────────
const BG_USER_KEY = "@ollia_bg_user_id";
const BG_TOKEN_KEY = "ollia_bg_auth_token"; // SecureStore (no @ prefix)

// ── Heartbeat sender (runs outside React) ───────────────────────────

const RAW_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "http://localhost:8080");

const API_URL = RAW_BASE.endsWith("/api") ? RAW_BASE : `${RAW_BASE}/api`;

async function sendBackgroundHeartbeat(): Promise<void> {
  const userId = await AsyncStorage.getItem(BG_USER_KEY);
  if (!userId) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const token = await SecureStore.getItemAsync(BG_TOKEN_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {
    // SecureStore may fail in some background states — proceed without auth
  }

  const res = await fetch(`${API_URL}/activity`, {
    method: "POST",
    headers,
    body: JSON.stringify({ userId, signalType: "background" }),
  });

  if (!res.ok) {
    throw new Error(`Background heartbeat failed: ${res.status}`);
  }
}

// ── Task definitions (must be at module scope) ──────────────────────

TaskManager.defineTask(BG_FETCH_TASK, async () => {
  try {
    await sendBackgroundHeartbeat();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(BG_LOCATION_TASK, async () => {
  // Location data is intentionally discarded — this is a trigger only.
  try {
    await sendBackgroundHeartbeat();
  } catch {
    // Silent failure is fine for a background trigger
  }
});

// ── Public API ──────────────────────────────────────────────────────

/**
 * Cache the current auth token so background tasks can authenticate.
 * Call this whenever the foreground app obtains a fresh token.
 */
export async function storeBackgroundToken(
  token: string | null
): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(BG_TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(BG_TOKEN_KEY);
    }
  } catch {
    // SecureStore writes can fail in edge-cases; non-critical
  }
}

/**
 * Register all background activity detection strategies.
 * Safe to call multiple times — tasks are only registered once.
 */
export async function registerBackgroundActivity(
  userId: string
): Promise<void> {
  if (Platform.OS === "web") return;

  await AsyncStorage.setItem(BG_USER_KEY, userId);

  // 1. Background Fetch
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
      const registered = await TaskManager.isTaskRegisteredAsync(BG_FETCH_TASK);
      if (!registered) {
        await BackgroundFetch.registerTaskAsync(BG_FETCH_TASK, {
          minimumInterval: 15 * 60, // 15 minutes (iOS may schedule less frequently)
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    }
  } catch (e) {
    console.warn("Background fetch registration failed:", e);
  }

  // 2. Significant Location Changes (iOS only, if permission already granted)
  if (Platform.OS === "ios") {
    await startLocationTrigger();
  }
}

/**
 * Start significant-location-change monitoring.
 * Only activates if background location permission is already granted.
 * Never prompts the user — this is opt-in via system Settings.
 */
async function startLocationTrigger(): Promise<void> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return;

    const registered = await TaskManager.isTaskRegisteredAsync(BG_LOCATION_TASK);
    if (registered) return;

    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Lowest,
      distanceInterval: 500,
      deferredUpdatesInterval: 15 * 60 * 1000,
      showsBackgroundLocationIndicator: false,
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.Other,
    });
  } catch {
    // Location services unavailable or restricted — silently skip
  }
}

/**
 * Tear down all background tasks and clear stored credentials.
 * Call on sign-out.
 */
export async function unregisterBackgroundActivity(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BG_FETCH_TASK)) {
      await BackgroundFetch.unregisterTaskAsync(BG_FETCH_TASK);
    }
  } catch {}

  try {
    if (await TaskManager.isTaskRegisteredAsync(BG_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch {}

  await AsyncStorage.removeItem(BG_USER_KEY).catch(() => {});
  await storeBackgroundToken(null);
}

/**
 * Request foreground then background location permission.
 * Returns true if background location is now granted.
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  // Step 1: foreground permission
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== Location.PermissionStatus.GRANTED) return false;

  // Step 2: background permission (requires foreground first on iOS)
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== Location.PermissionStatus.GRANTED) return false;

  // Kick off the location trigger now that we have permission
  if (Platform.OS === "ios") {
    await startLocationTrigger();
  }

  return true;
}

/**
 * Check whether background location permission is currently granted.
 */
export async function hasBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true; // not relevant on web
  const { status } = await Location.getBackgroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/** Label describing the current detection method for the UI. */
export const DETECTION_LABEL = "Passive detection";
