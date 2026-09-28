import PostHog from "posthog-react-native";

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
// A project token and its region travel together. Never silently guess the region.
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim();
const isConfigured = Boolean(apiKey?.startsWith("phc_") && host?.startsWith("https://"));

if (__DEV__ && !isConfigured) {
  console.warn(
    "PostHog is disabled. Set EXPO_PUBLIC_POSTHOG_KEY and its matching HTTPS EXPO_PUBLIC_POSTHOG_HOST to enable analytics.",
  );
}

/**
 * Shared PostHog client for Expo.
 * Disabled unless both the project token and host are configured.
 */
export const posthog = new PostHog(apiKey || "phc_disabled", {
  host,
  disabled: !isConfigured,
  captureAppLifecycleEvents: true,
  flushAt: 20,
  flushInterval: 10000,
});

if (__DEV__ && isConfigured) {
  posthog.debug(true);
}

export const isPostHogEnabled = isConfigured;
