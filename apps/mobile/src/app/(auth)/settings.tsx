import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  SafeAreaView,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { theme } from '../../lib/theme';
import { api } from '../../lib/api';

export default function SettingsScreen() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.fullName || user.firstName || '');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (token) {
        await api.updateUser(
          { name: displayName, region: region || undefined },
          token
        );
        Alert.alert('Saved', 'Your profile has been updated.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const invite = await api.createInvite(token);
      await Share.share({
        message: `Join my family circle on Ollia: ${invite.deepLink}`,
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to create invite.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'Are you sure? This will permanently delete your account and remove you from all family circles.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const token = await getToken();
            if (token) {
              // Fire deletion request — don't await. The backend wipes
              // DB synchronously and deletes Clerk async, so the 204
              // will arrive quickly. Meanwhile we sign out immediately.
              api.deleteAccount(token).catch(() => {});
            }
            await signOut();
          },
        },
      ],
    );
  };

  if (deleting) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Region</Text>
        <TextInput
          style={styles.input}
          value={region}
          onChangeText={setRegion}
          placeholder="e.g. Dubai"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={styles.hint}>Coarse location only, visible to family</Text>
      </View>

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable style={styles.inviteButton} onPress={handleInvite}>
        <Text style={styles.inviteButtonText}>Invite family member</Text>
      </Pressable>

      <View style={{ flex: 1 }} />

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteText}>Delete account</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 24,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.text,
    paddingTop: 16,
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 24,
  },
  inviteButton: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  inviteButtonText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  signOutText: {
    color: theme.colors.checkin,
    fontSize: 16,
    fontWeight: '500',
  },
  deleteButton: {
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  deleteText: {
    color: '#E24B4A',
    fontSize: 14,
    fontWeight: '500',
  },
});
