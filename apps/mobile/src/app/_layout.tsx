import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import {I18nManager, Platform, View} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider } from "posthog-react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { FamilyProvider } from "@/context/FamilyContext";
import { FoundingModal } from "@/components/FoundingModal";
import { posthog } from "@/config/posthog";
import i18n, { mapLocaleToSupported, LANGUAGE_STORAGE_KEY } from "@/i18n";
import Purchases, {STOREKIT_VERSION} from 'react-native-purchases';

import "@/services/backgroundActivity";
import {
  identifyUser,
  initSourceChannelFromUrl,
  resetAnalytics,
} from "@/utils/analytics";
import {initInstallDate, triggerReviewAfter7Days} from "@/utils/reviewPrompt";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const ONBOARDING_COMPLETE_KEY = "@ollia_onboarding_complete";

const tokenCache =
    Platform.OS === "web"
        ? undefined
        : {
          async getToken(key: string) {
            try { return await SecureStore.getItemAsync(key); } catch { return null; }
          },
          async saveToken(key: string, value: string) {
            try { await SecureStore.setItemAsync(key, value); } catch {}
          },
        };

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (isSignedIn && userId) {
      Purchases.logIn(userId);
      identifyUser(userId);
    } else if (!isSignedIn) {
      resetAnalytics();
    }
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!isSignedIn || !userId) { setOnboardingComplete(null); return; }
    (async () => {
      try {
        // Per-user key — a new account on the same device sees onboarding.
        const flag = await AsyncStorage.getItem(`${ONBOARDING_COMPLETE_KEY}:${userId}`);
        setOnboardingComplete(flag === "true");
      } catch {
        setOnboardingComplete(true); // fail open — don't trap user
      }
    })();
  }, [isSignedIn, userId, segments]);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuth        = segments[0] === "(auth)";
    const inOnboarding  = segments[0] === "onboarding";
    const inInvite      = segments[0] === "invite";
    const inPremiumRedirect =
        segments[0] === "premium-success" || segments[0] === "premium-cancel";

    if (inInvite || inPremiumRedirect) {
      setAuthReady(true);
      return;
    }

    if (!isSignedIn && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuth) {
      if (onboardingComplete === null) return;
      // if (onboardingComplete) 
      //   router.replace("/(tabs)");
      // else                    
        router.replace("/onboarding/hook");
    } else if (isSignedIn && userId && !inAuth && !inOnboarding && segments[0] === "(tabs)") {
      // Re-read fresh from storage — the React state can still be stale right after
      // completing onboarding, which previously bounced the user back into it.
      AsyncStorage.getItem(`${ONBOARDING_COMPLETE_KEY}:${userId}`)
        .then((flag) => { if (flag !== "true") router.replace("/onboarding/hook"); })
        .catch(() => {});
    }

    setAuthReady(true);
  }, [isSignedIn, isLoaded, segments, onboardingComplete]);

  if (!isLoaded || !authReady) return <View style={{ flex: 1, backgroundColor: "#F0E2C4" }} />;

  return <>{children}</>;
}

function RootLayoutNav() {
  const pathname = usePathname();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthog.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
      });
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return (
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="member/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="join" options={{ headerShown: false, animation: "slide_from_bottom" }} />
          <Stack.Screen name="invite" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="premium-success" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="premium-cancel" options={{ headerShown: false, animation: "fade" }} />
        </Stack>
        <FoundingModal />
      </AuthGate>
  );
}

function SplashGate({ fontsReady, i18nReady, children }: {
  fontsReady: boolean; i18nReady: boolean; children: React.ReactNode;
}) {
  const { isLoaded } = useAuth();
  const splashHidden = useRef(false);
  useEffect(() => {
    if (fontsReady && isLoaded && i18nReady && !splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, [fontsReady, isLoaded, i18nReady]);
  if (!fontsReady || !isLoaded || !i18nReady) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const [i18nReady, setI18nReady] = useState(false);
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    async function initLanguage() {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        let lang: string;
        if (stored) lang = stored;
        else {
          const deviceLocale = Localization.getLocales()[0]?.languageCode ?? "en";
          lang = mapLocaleToSupported(deviceLocale);
        }
        await i18n.changeLanguage(lang);
        const shouldBeRTL = lang === "ar";
        if (I18nManager.isRTL !== shouldBeRTL) I18nManager.forceRTL(shouldBeRTL);
      } catch {
        await i18n.changeLanguage("en");
      } finally { setI18nReady(true); }
    }
    initLanguage();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      Purchases.configure({
        apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
        storeKitVersion: STOREKIT_VERSION.STOREKIT_2,
      });
    } else if (Platform.OS === 'android') {
      Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '' });
    }
  }, []);

  useEffect(() => {
    initInstallDate();
    triggerReviewAfter7Days();
  }, []);

  // Privacy-respecting channel attribution (promo links / UTMs only).
  useEffect(() => {
    Linking.getInitialURL().then(initSourceChannelFromUrl).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => {
      initSourceChannelFromUrl(url);
    });
    return () => sub.remove();
  }, []);

  return (
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <PostHogProvider
          client={posthog}
          autocapture={{
            captureScreens: false,
            captureTouches: true,
            propsToCapture: ["testID"],
            maxElementsCaptured: 20,
          }}
        >
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <SplashGate fontsReady={fontsReady} i18nReady={i18nReady}>
                <FamilyProvider>
                  <RootLayoutNav />
                </FamilyProvider>
              </SplashGate>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </PostHogProvider>
      </ClerkProvider>
  );
}