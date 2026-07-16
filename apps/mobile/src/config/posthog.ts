import PostHog from "posthog-react-native";

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
/** EU Cloud by default — privacy-brand fit. Override for self-host. */
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const isConfigured = Boolean(apiKey && apiKey.startsWith("phc_"));

if (__DEV__ && !isConfigured) {
  console.warn(
    "PostHog project token not configured. Set EXPO_PUBLIC_POSTHOG_KEY to enable analytics.",
  );
}

/**
 * Shared PostHog client for Expo.
 * Disabled when EXPO_PUBLIC_POSTHOG_KEY is missing so local builds stay quiet.
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
