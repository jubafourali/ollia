import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { theme } from '../lib/theme';
import { api } from '../lib/api';
import { registerBackgroundHeartbeat } from '../lib/background';

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AuthGate() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/status');
    } else if (!isSignedIn && inAuthGroup) {
      router.replace('/');
    }
  }, [isSignedIn, isLoaded]);

  useEffect(() => {
    if (!isSignedIn || !user) return;

    const bootstrap = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // 1. Create user first — everything depends on this
        await api.syncUser(
          { name: user.fullName ?? 'New User', email: user.primaryEmailAddress?.emailAddress ?? '' },
          token,
        );

        // 2. Only after user exists in DB, run these in parallel
        const expoPushToken = (await Notifications.getExpoPushTokenAsync()).data;
        await Promise.all([
          api.heartbeat(token),
          api.savePushToken(expoPushToken, token),
        ]);
      } catch (error) {
        console.error('Bootstrap failed:', error);
      }
    };

    bootstrap();
    registerBackgroundHeartbeat();
  }, [isSignedIn, user]);

  return (
    <>
      <Slot />
      {!isLoaded && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar style="dark" />
      <AuthGate />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
