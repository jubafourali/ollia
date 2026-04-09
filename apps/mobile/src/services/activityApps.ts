/**
 * Activity Apps — proof-of-life detection via app usage.
 *
 * On iOS, third-party apps cannot directly observe when other apps are
 * opened. Apple's privacy model intentionally prevents this. The Screen
 * Time / DeviceActivityMonitor API requires a special entitlement and
 * Family Controls enrollment that is not available to standard apps.
 *
 * This module provides:
 *   1. A curated catalog of common apps the user can select.
 *   2. Local-only storage of the user's selections (never sent to backend).
 *   3. A capability check that honestly reports whether detection is
 *      available on the current OS version.
 *
 * The actual heartbeat continues to rely on Ollia's passive detection
 * system (background fetch, significant location changes, app resume).
 * The selected app list serves as a declaration of intent — and as a
 * hook point for when Apple opens up detection APIs in the future or
 * for power users who wire up iOS Shortcuts automations.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ── Storage key ─────────────────────────────────────────────────────
const SELECTED_APPS_KEY = "@ollia_activity_apps";

// ── App catalog ─────────────────────────────────────────────────────

export type AppEntry = {
  id: string;
  name: string;
  category: string;
};

/** Curated list of well-known apps grouped by category. */
export const APP_CATALOG: AppEntry[] = [
  // Communication
  { id: "messages", name: "Messages", category: "Communication" },
  { id: "whatsapp", name: "WhatsApp", category: "Communication" },
  { id: "telegram", name: "Telegram", category: "Communication" },
  { id: "signal", name: "Signal", category: "Communication" },
  { id: "facetime", name: "FaceTime", category: "Communication" },
  { id: "phone", name: "Phone", category: "Communication" },

  // Social
  { id: "instagram", name: "Instagram", category: "Social" },
  { id: "facebook", name: "Facebook", category: "Social" },
  { id: "twitter", name: "X (Twitter)", category: "Social" },
  { id: "snapchat", name: "Snapchat", category: "Social" },
  { id: "tiktok", name: "TikTok", category: "Social" },

  // Productivity
  { id: "mail", name: "Mail", category: "Productivity" },
  { id: "gmail", name: "Gmail", category: "Productivity" },
  { id: "outlook", name: "Outlook", category: "Productivity" },
  { id: "slack", name: "Slack", category: "Productivity" },
  { id: "teams", name: "Microsoft Teams", category: "Productivity" },

  // Maps & Navigation
  { id: "maps", name: "Maps", category: "Maps" },
  { id: "google-maps", name: "Google Maps", category: "Maps" },
  { id: "waze", name: "Waze", category: "Maps" },

  // Health & Fitness
  { id: "health", name: "Health", category: "Health" },
  { id: "strava", name: "Strava", category: "Health" },
  { id: "fitness", name: "Fitness", category: "Health" },

  // Entertainment
  { id: "youtube", name: "YouTube", category: "Entertainment" },
  { id: "spotify", name: "Spotify", category: "Entertainment" },
  { id: "netflix", name: "Netflix", category: "Entertainment" },

  // Finance
  { id: "wallet", name: "Wallet", category: "Finance" },
  { id: "banking", name: "Banking app", category: "Finance" },

  // Utilities
  { id: "camera", name: "Camera", category: "Utilities" },
  { id: "photos", name: "Photos", category: "Utilities" },
  { id: "safari", name: "Safari", category: "Utilities" },
  { id: "chrome", name: "Chrome", category: "Utilities" },
  { id: "settings", name: "Settings", category: "Utilities" },
];

// ── Capability check ────────────────────────────────────────────────

export type DetectionCapability = {
  available: false;
  reason: string;
  tip: string;
};

/**
 * Check whether the current platform supports detecting other apps.
 * On iOS this always returns unavailable (Apple restriction).
 */
export function getDetectionCapability(): DetectionCapability {
  if (Platform.OS === "ios") {
    return {
      available: false,
      reason:
        "iOS does not allow apps to detect when other apps are opened. " +
        "This is an Apple privacy restriction that applies to all third-party apps.",
      tip:
        'You can use iOS Shortcuts to automate this: create a Personal Automation ' +
        'triggered by opening an app, then add an "Open URL" action with ollia://heartbeat.',
    };
  }

  return {
    available: false,
    reason:
      "App detection is not yet supported on this platform.",
    tip: "Ollia still detects your activity using background fetch and location triggers.",
  };
}

// ── Local persistence (device-only, never sent to backend) ──────────

export async function getSelectedApps(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_APPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function setSelectedApps(appIds: string[]): Promise<void> {
  await AsyncStorage.setItem(SELECTED_APPS_KEY, JSON.stringify(appIds));
}

export async function addSelectedApp(appId: string): Promise<string[]> {
  const current = await getSelectedApps();
  if (current.includes(appId)) return current;
  const next = [...current, appId];
  await setSelectedApps(next);
  return next;
}

export async function removeSelectedApp(appId: string): Promise<string[]> {
  const current = await getSelectedApps();
  const next = current.filter((id) => id !== appId);
  await setSelectedApps(next);
  return next;
}

/** Look up catalog entries for a list of app IDs. */
export function resolveApps(appIds: string[]): AppEntry[] {
  const set = new Set(appIds);
  return APP_CATALOG.filter((app) => set.has(app.id));
}
