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
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FamilyProvider } from "@/context/FamilyContext";

// Import to register background tasks at module scope (TaskManager.defineTask)
import "@/services/backgroundActivity";

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
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuth = segments[0] === "(auth)";
    const inInvite = segments[0] === "invite";
    const inPremiumRedirect =
      segments[0] === "premium-success" || segments[0] === "premium-cancel";

    // Allow invite onboarding and post-checkout redirect screens without auth gate
    if (inInvite || inPremiumRedirect) {
      setAuthReady(true);
      return;
    }

    if (!isSignedIn && !inAuth) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuth) {
      router.replace("/(tabs)");
    }

    // Mark auth as ready after first routing decision
    setAuthReady(true);
  }, [isSignedIn, isLoaded, segments]);

  // Don't render children until Clerk has loaded and first routing decision is made.
  // This prevents the brief flash of the wrong screen.
  if (!isLoaded || !authReady) return null;

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
    </AuthGate>
  );
}

/**
 * SplashGate — keeps the native splash visible until Clerk auth is loaded.
 * Must be inside ClerkProvider so it can read useAuth().
 */
function SplashGate({ fontsReady, children }: { fontsReady: boolean; children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  const splashHidden = useRef(false);

  useEffect(() => {
    if (fontsReady && isLoaded && !splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, [fontsReady, isLoaded]);

  // Don't render anything until both fonts and auth are ready
  if (!fontsReady || !isLoaded) return null;

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const fontsReady = fontsLoaded || !!fontError;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SplashGate fontsReady={fontsReady}>
            <FamilyProvider>
              <RootLayoutNav />
            </FamilyProvider>
          </SplashGate>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
