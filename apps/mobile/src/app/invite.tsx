import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { theme } from '../lib/theme';
import { api } from '../lib/api';

export default function InviteScreen() {
  const { token: inviteToken } = useLocalSearchParams<{ token: string }>();
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'pending' | 'joined' | 'error'>('pending');

  const handleAccept = async () => {
    if (!inviteToken) return;
    setLoading(true);
    try {
      const authToken = await getToken();
      if (!authToken) {
        router.replace('/');
        return;
      }
      const result = await api.acceptInvite(inviteToken, authToken);
      setStatus(result.status === 'joined' || result.status === 'already_member' ? 'joined' : 'error');
    } catch (e) {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (!isSignedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Family Invite</Text>
        <Text style={styles.text}>Please sign in first to accept this invite.</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'joined') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to the circle!</Text>
        <Text style={styles.text}>You've joined the family circle. You can now see each other's status.</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/(auth)/family')}>
          <Text style={styles.buttonText}>View family</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.text}>This invite may have expired or already been used.</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/(auth)/status')}>
          <Text style={styles.buttonText}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Family Invite</Text>
      <Text style={styles.text}>You've been invited to join a family circle on Ollia.</Text>
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={styles.buttonText}>Join their circle</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 200,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
