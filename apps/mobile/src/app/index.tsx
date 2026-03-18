import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSignIn, useSignUp, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { theme } from '../lib/theme';

export default function OnboardingScreen() {
  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reactive fallback: navigate when Clerk context confirms sign-in
  useEffect(() => {
    if (isSignedIn) {
      router.replace('/(auth)/status');
    }
  }, [isSignedIn]);

  const handleSignUp = async () => {
    if (!signUp || !email) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const completeSignUp = async (signUpResult: any) => {
    await setSignUpActive!({ session: signUpResult.createdSessionId });
    router.replace('/(auth)/status');
  };

  const handleVerify = async () => {
    if (!signUp || !code) return;
    setLoading(true);
    try {
      let result = await signUp.attemptEmailAddressVerification({ code });
      console.log('OTP verify — status:', result.status);

      if (result.status === 'complete') {
        await completeSignUp(result);
        return;
      }

      if (result.status === 'missing_requirements') {
        console.log('missing_requirements — missingFields:', result.missingFields);
        console.log('missing_requirements — unverifiedFields:', result.unverifiedFields);
        console.log('missing_requirements — requiredFields:', result.requiredFields);

        const updates: Record<string, string> = {};

        if (result.missingFields?.includes('username')) {
          updates.username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
        }
        if (result.missingFields?.includes('first_name')) {
          updates.firstName = name || email.split('@')[0];
        }
        if (result.missingFields?.includes('last_name')) {
          updates.lastName = '';
        }

        if (Object.keys(updates).length > 0) {
          console.log('Auto-filling missing fields:', updates);
          result = await signUp.update(updates);
          console.log('After update — status:', result.status);
        }

        if (result.status === 'complete') {
          await completeSignUp(result);
          return;
        }

        // Still not complete — log what's left for debugging
        console.log('Still not complete — status:', result.status,
          'missingFields:', result.missingFields,
          'unverifiedFields:', result.unverifiedFields);
        Alert.alert(
          'Almost there',
          `Additional info required: ${result.missingFields?.join(', ') || 'unknown'}`,
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!signIn || !email) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email });
      if (result.status === 'complete') {
        await setSignInActive!({ session: result.createdSessionId });
        router.replace('/(auth)/status');
      } else {
        const emailFactor = result.supportedFirstFactors?.find(
          (f: any) => f.strategy === 'email_code'
        ) as any;
        if (emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setPendingVerification(true);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignInVerify = async () => {
    if (!signIn || !code) return;
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (result.status === 'complete') {
        await setSignInActive!({ session: result.createdSessionId });
        router.replace('/(auth)/status');
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <View style={{ flexDirection: 'row' }}>
          <Text style={styles.logo}>Oll</Text>
          <Text style={[styles.logo, { color: '#F59E0B' }]}>ia</Text>
        </View>
        <Text style={styles.tagline}>Your family knows you're safe</Text>
      </View>

      <View style={styles.form}>
        {!pendingVerification ? (
          <>
            {isSignUpMode && (
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={theme.colors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={theme.colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={isSignUpMode ? handleSignUp : handleSignIn}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Please wait...' : isSignUpMode ? 'Sign up' : 'Sign in'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setIsSignUpMode(!isSignUpMode)}>
              <Text style={styles.switchText}>
                {isSignUpMode
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.verifyText}>We sent a code to {email}</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter code"
              placeholderTextColor={theme.colors.textSecondary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
            />
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={isSignUpMode ? handleVerify : handleSignInVerify}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Verifying...' : 'Verify'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 52,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -1,
  },
  logoAccent: {
    color: '#F59E0B',
  },
  tagline: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  form: {
    gap: 16,
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
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    textAlign: 'center',
    color: theme.colors.accent,
    fontSize: 14,
    marginTop: 4,
  },
  verifyText: {
    textAlign: 'center',
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
});
