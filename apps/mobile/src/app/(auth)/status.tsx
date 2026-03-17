import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { theme } from '../../lib/theme';
import { api } from '../../lib/api';
import { PulsingCircle } from '../../components/PulsingCircle';
import { StatusBadge } from '../../components/StatusBadge';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function StatusScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);
  const hasSynced = useRef(false);

  // Sync user to backend on first mount
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    (async () => {
      try {
        const token = await getToken();
        if (token && user) {
          await api.syncUser(
            {
              name: user.fullName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || '',
              email: user.primaryEmailAddress?.emailAddress || '',
            },
            token,
          );
        }
      } catch (e) {
        console.warn('User sync failed:', e);
      }
    })();
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        await api.heartbeat(token);
        setLastSeen(new Date().toISOString());
      }
    } catch (e) {
      console.warn('Heartbeat failed:', e);
    }
  }, [getToken]);

  // Register push token on mount
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        const pushToken = await Notifications.getExpoPushTokenAsync();
        const token = await getToken();
        if (token) {
          await api.savePushToken(pushToken.data, token);
        }
      }
    })();
  }, []);

  // Send heartbeat on focus
  useFocusEffect(
    useCallback(() => {
      sendHeartbeat();
    }, [sendHeartbeat])
  );

  // Send heartbeat on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sendHeartbeat();
    });
    return () => subscription.remove();
  }, [sendHeartbeat]);

  // Handle notification actions
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const actionId = response.actionIdentifier;
        if (actionId === 'im_fine' || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          await sendHeartbeat();
        }
      }
    );
    return () => subscription.remove();
  }, [sendHeartbeat]);

  const formatLastSeen = () => {
    if (!lastSeen) return 'Just now';
    const date = new Date(lastSeen);
    return `Last active ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <PulsingCircle color={theme.colors.accent} />
        <Text style={styles.statusText}>You're safe</Text>
        <StatusBadge status="safe" size="large" />
        <Text style={styles.lastSeen}>{formatLastSeen()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 40,
  },
  statusText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 32,
  },
  lastSeen: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
  },
});
