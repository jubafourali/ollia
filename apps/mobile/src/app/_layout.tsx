import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import {I18nManager, Platform, View} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { FamilyProvider } from "@/context/FamilyContext";
import { FoundingModal } from "@/components/FoundingModal";
import i18n, { mapLocaleToSupported, LANGUAGE_STORAGE_KEY } from "@/i18n";
import Purchases, {STOREKIT_VERSION} from 'react-native-purchases';

// Import to register background tasks at module scope (TaskManager.defineTask)
import "@/services/backgroundActivity";
import {initInstallDate, triggerReviewAfter7Days} from "@/utils/reviewPrompt";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const tokenCache =
    Platform.OS === "web"
        ? undefined
        : {
          async getToken(key: string) {
            try {
              return await SecureStore.getItemAsync(key);
            } catch {
              return null;
            }
          },
          async saveToken(key: string, value: string) {
            try {
              await SecureStore.setItemAsync(key, value);
            } catch {}
          },
        };

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId } = useAuth();  // add userId here
  const segments = useSegments();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  // RevenueCat identity sync
  useEffect(() => {
    if (isSignedIn && userId) {
      Purchases.logIn(userId);
    }
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuth = segments[0] === "(auth)";
    const inInvite = segments[0] === "invite";
    const inPremiumRedirect =
        segments[0] === "premium-success" || segments[0] === "premium-cancel";

    if (inInvite || inPremiumRedirect) {
      setAuthReady(true);
      return;
    }

    if (!isSignedIn && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuth) {
      router.replace("/(tabs)");
    }

    setAuthReady(true);
  }, [isSignedIn, isLoaded, segments]);

  if (!isLoaded || !authReady) return <View style={{ flex: 1, backgroundColor: "#F0E2C4" }} />;

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
              name="member/[id]"
              options={{ headerShown: false, animation: "slide_from_right" }}
          />
          <Stack.Screen
              name="join"
              options={{ headerShown: false, animation: "slide_from_bottom" }}
          />
          <Stack.Screen
              name="invite"
              options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
              name="premium-success"
              options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
              name="premium-cancel"
              options={{ headerShown: false, animation: "fade" }}
          />
        </Stack>
        {/* Overlays on top of any screen when a founding member hasn't claimed yet */}
        <FoundingModal />
      </AuthGate>
  );
}

/**
 * SplashGate — keeps the native splash visible until Clerk auth and i18n are loaded.
 * Must be inside ClerkProvider so it can read useAuth().
 */
function SplashGate({
                      fontsReady,
                      i18nReady,
                      children,
                    }: {
  fontsReady: boolean;
  i18nReady: boolean;
  children: React.ReactNode;
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
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [i18nReady, setI18nReady] = useState(false);

  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    async function initLanguage() {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        let lang: string;
        if (stored) {
          lang = stored;
        } else {
          const deviceLocale = Localization.getLocales()[0]?.languageCode ?? "en";
          lang = mapLocaleToSupported(deviceLocale);
        }
        await i18n.changeLanguage(lang);
        // Apply RTL for Arabic
        const shouldBeRTL = lang === "ar";
        if (I18nManager.isRTL !== shouldBeRTL) {
          I18nManager.forceRTL(shouldBeRTL);
        }
      } catch {
        // Fallback to English on any error
        await i18n.changeLanguage("en");
      } finally {
        setI18nReady(true);
      }
    }
    initLanguage();
  }, []);
  useEffect(() => {
    const iosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

    if (Platform.OS === 'ios') {
      Purchases.configure({
        apiKey: iosApiKey,
        storeKitVersion: STOREKIT_VERSION.STOREKIT_2,
      });
    }
  }, []);

  useEffect(() => {
    initInstallDate();
    triggerReviewAfter7Days()
  }, []);

  return (
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SplashGate fontsReady={fontsReady} i18nReady={i18nReady}>
              <FamilyProvider>
                <RootLayoutNav />
              </FamilyProvider>
            </SplashGate>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </ClerkProvider>
  );
}