import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSignIn, useSignUp, useSSO, useAuth } from "@clerk/clerk-expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { api, ApiCircleMember, setAuthTokenGetter } from "@/utils/api";
import { useFamilyContext } from "@/context/FamilyContext";
import { getCheckInLabel } from "@/utils/checkInLabel";

WebBrowser.maybeCompleteAuthSession();

const CIRCLE_KEY = "@ollia_circle_v2";
const INVITE_CODE_KEY = "@ollia_invite_code_v2";
const PROFILE_KEY = "@ollia_my_profile";
const PENDING_INVITE_KEY = "@ollia_pending_invite";

type Step = "welcome" | "identity" | "signup" | "success" | "firstValue";
type AuthStep = "email" | "otp";
type AuthMode = "sign-in" | "sign-up";

export default function InviteOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token: string; name: string }>();
  const { userId, getToken, isSignedIn } = useAuth();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { reloadCircleFromStorage, clearAllState, refreshCircle } = useFamilyContext();
  const { t } = useTranslation();

  const inviteToken = params.token ?? "";
  const inviterName = decodeURIComponent(params.name ?? "Someone");

  // Flow state
  const [step, setStep] = useState<Step>("welcome");
  const [userName, setUserName] = useState("");
  const [inviterMember, setInviterMember] = useState<ApiCircleMember | null>(null);

  // Auth state
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-retry tracking
  const authRetryCount = useRef(0);

  // Animations
  const fadeIn = useSharedValue(0);
  const slideUp = useSharedValue(30);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const successScale = useSharedValue(0.8);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const isClerkLoaded = signInLoaded && signUpLoaded;

  // Persist invite token for auth redirects
  useEffect(() => {
    if (inviteToken) {
      AsyncStorage.setItem(
        PENDING_INVITE_KEY,
        JSON.stringify({ token: inviteToken, inviterName })
      );
    }
  }, [inviteToken, inviterName]);

  // Persist entered name so it survives SSO redirects
  useEffect(() => {
    if (step === "signup" && userName.trim() && inviteToken) {
      AsyncStorage.setItem(
        PENDING_INVITE_KEY,
        JSON.stringify({ token: inviteToken, inviterName, userName: userName.trim() })
      );
    }
  }, [step, userName, inviteToken, inviterName]);

  // Animate in on step change
  useEffect(() => {
    fadeIn.value = 0;
    slideUp.value = 30;
    fadeIn.value = withTiming(1, { duration: 400 });
    slideUp.value = withSpring(0, { damping: 20 });
  }, [step]);

  // Pulsing green circle for success screen
  useEffect(() => {
    if (step === "success") {
      successScale.value = withSpring(1, { damping: 12 });
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 1200, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [step]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ translateY: slideUp.value }],
  }));

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const successCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  // If user is already signed in when landing here, skip straight to joining
  const hasSkippedToJoin = useRef(false);
  useEffect(() => {
    if (isSignedIn && userId && !hasSkippedToJoin.current && (step === "welcome" || step === "identity")) {
      hasSkippedToJoin.current = true;
      handlePostAuth();
    }
  }, [isSignedIn, userId, step]);

  const handlePostAuth = useCallback(async () => {
    if (!userId || !getToken) return;
    setLoading(true);
    setError("");

    try {
      // Clear any stale cached data from a previous user before setting up new circle
      await clearAllState();

      setAuthTokenGetter(getToken);

      // Use the entered name, or restore from storage (survives SSO redirects), or fetch existing profile
      let profileName = userName.trim();
      if (!profileName) {
        try {
          const pending = await AsyncStorage.getItem(PENDING_INVITE_KEY);
          if (pending) {
            const parsed = JSON.parse(pending);
            profileName = parsed.userName ?? "";
          }
        } catch {}
      }
      if (!profileName) {
        try {
          const me = await api.getMe();
          profileName = me?.name ?? "";
        } catch {}
      }

      await api.upsertUser({
        id: userId,
        name: profileName,
      });
      await AsyncStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ name: profileName, region: "" })
      );

      const circle = await api.joinCircle({
        inviteCode: inviteToken,
        userId,
        relation: t("invite.relations.Other"),
      });

      await AsyncStorage.setItem(CIRCLE_KEY, circle.id);
      await AsyncStorage.setItem(INVITE_CODE_KEY, circle.inviteCode);
      await api.sendHeartbeat(userId, "app_open");

      // Fetch circle directly — the invitee's AsyncStorage has no circleId yet,
      // so reloadCircleFromStorage would no-op
      const freshCircle = await api.getCircle(circle.id);

      // Find the inviter in circle members
      const inviter = freshCircle.members.find(
        (m) => m.userId !== userId && m.name.toLowerCase() === inviterName.toLowerCase()
      ) ?? freshCircle.members.find((m) => m.userId !== userId) ?? null;
      setInviterMember(inviter);

      // Now that storage is populated, also reload into context for the main app
      await reloadCircleFromStorage();

      await AsyncStorage.removeItem(PENDING_INVITE_KEY);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setStep("success");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("404") || msg.includes("not found")) {
        setError(t("join.errorInvalid"));
      } else if (msg.includes("PLAN_LIMIT") || msg.includes("Member limit")) {
        setError(t("join.errorFull"));
      } else {
        setError(t("join.errorGeneric"));
      }
      console.error("Join error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, getToken, userName, inviteToken, inviterName, reloadCircleFromStorage, clearAllState]);

  // --- Auth handlers (same pattern as sign-in.tsx) ---

  async function handleEmailContinue(isRetry = false) {
    if (!email.trim() || !isClerkLoaded) return;
    setLoading(true);
    setError("");
    try {
      const si = await signIn!.create({ identifier: email.trim() });
      const factor = si.supportedFirstFactors?.find(
        (f) => f.strategy === "email_code"
      );
      if (factor && "emailAddressId" in factor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: factor.emailAddressId,
        });
        setAuthMode("sign-in");
        setAuthStep("otp");
        authRetryCount.current = 0;
      }
    } catch (e: any) {
      const code = e?.errors?.[0]?.code;
      if (code === "form_identifier_not_found") {
        try {
          await signUp!.create({ emailAddress: email.trim() });
          await signUp!.prepareEmailAddressVerification({
            strategy: "email_code",
          });
          setAuthMode("sign-up");
          setAuthStep("otp");
          authRetryCount.current = 0;
        } catch (e2: any) {
          if (!isRetry && authRetryCount.current === 0) {
            authRetryCount.current = 1;
            setLoading(false);
            return handleEmailContinue(true);
          }
          setError(
            e2?.errors?.[0]?.longMessage ?? t("onboarding.errorGeneric")
          );
        }
      } else {
        if (!isRetry && authRetryCount.current === 0) {
          authRetryCount.current = 1;
          setLoading(false);
          return handleEmailContinue(true);
        }
        setError(
          e?.errors?.[0]?.longMessage ?? t("onboarding.errorGeneric")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(isRetry = false) {
    if (!otp.trim() || !isClerkLoaded) return;
    setLoading(true);
    setError("");
    try {
      if (authMode === "sign-in") {
        const result = await signIn!.attemptFirstFactor({
          strategy: "email_code",
          code: otp.trim(),
        });
        if (result.status === "complete") {
          await setSignInActive!({ session: result.createdSessionId });
        }
      } else {
        const result = await signUp!.attemptEmailAddressVerification({
          code: otp.trim(),
        });
        if (result.status === "complete") {
          await setSignUpActive!({ session: result.createdSessionId! });
        }
      }
      authRetryCount.current = 0;
    } catch (e: any) {
      if (!isRetry && authRetryCount.current === 0) {
        authRetryCount.current = 1;
        setLoading(false);
        return handleVerifyOtp(true);
      }
      setError(e?.errors?.[0]?.longMessage ?? t("onboarding.errorCode"));
      setLoading(false);
      return;
    }
    // Don't setLoading(false) here — handlePostAuth will take over
  }

  async function handleSSO(strategy: "oauth_google" | "oauth_apple") {
    setLoading(true);
    setError("");
    try {
      const redirectUrl = Linking.createURL("/invite", {
        queryParams: {
          token: inviteToken,
          name: encodeURIComponent(inviterName),
        },
      });
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl,
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // handlePostAuth will be triggered by isSignedIn change
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? t("onboarding.errorSignInFailed"));
    } finally {
      setLoading(false);
    }
  }

  // When auth completes (isSignedIn becomes true while on signup step)
  const hasTriggeredPostAuth = useRef(false);
  useEffect(() => {
    if (isSignedIn && userId && step === "signup" && !hasTriggeredPostAuth.current) {
      hasTriggeredPostAuth.current = true;
      handlePostAuth();
    }
  }, [isSignedIn, userId, step, handlePostAuth]);

  // =================== SCREEN 1: WELCOME ===================
  function renderWelcome() {
    return (
      <View style={[styles.fullScreen, { paddingTop: topInset + 40, paddingBottom: bottomInset + 24 }]}>
        <Animated.View style={[styles.welcomeContent, contentStyle]}>
          {/* Wordmark */}
          <Text style={styles.wordmark}>
            Oll<Text style={{ color: BRAND.primary }}>ia</Text>
          </Text>

          {/* Avatar */}
          <View style={styles.welcomeAvatarWrap}>
            <View style={styles.welcomeAvatar}>
              <Text style={styles.welcomeAvatarText}>
                {inviterName[0]?.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Main message */}
          <Text style={styles.welcomeTitle}>
            {inviterName} invited you {"\uD83D\uDC9B"}
          </Text>

          <Text style={styles.welcomeDescription}>
            Ollia quietly lets your family know you're safe — no constant
            check-ins, just a gentle signal.
          </Text>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setStep("identity");
            }}
          >
            <Text style={styles.ctaButtonText}>
              Join {inviterName}'s circle
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // =================== SCREEN 2: IDENTITY ===================
  function renderIdentity() {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.flex, { paddingTop: topInset + 24, paddingHorizontal: 28 }]}>
          <Animated.View style={[{ flex: 1 }, contentStyle]}>
            {/* Back button */}
            <Pressable
              style={styles.backButton}
              onPress={() => setStep("welcome")}
            >
              <Feather name="arrow-left" size={20} color={BRAND.textSecondary} />
            </Pressable>

            <Text style={styles.screenTitle}>
              What should {inviterName} call you?
            </Text>

            <TextInput
              style={styles.nameInput}
              placeholder={t("join.yourNamePlaceholder")}
              placeholderTextColor={BRAND.textMuted}
              value={userName}
              onChangeText={setUserName}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (userName.trim()) {
                  setError("");
                  setStep("signup");
                }
              }}
            />
          </Animated.View>

          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              !userName.trim() && styles.ctaDisabled,
              pressed && { opacity: 0.85 },
              { marginBottom: bottomInset + 24 },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setError("");
              setStep("signup");
            }}
            disabled={!userName.trim()}
          >
            <Text style={styles.ctaButtonText}>{t("family.invite.continue")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // =================== SCREEN 3: SIGN UP ===================
  function renderSignup() {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.screenContainer,
            { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={contentStyle}>
            {/* Back button */}
            <Pressable
              style={styles.backButton}
              onPress={() => {
                setAuthStep("email");
                setOtp("");
                setError("");
                setStep("identity");
              }}
            >
              <Feather name="arrow-left" size={20} color={BRAND.textSecondary} />
            </Pressable>

            <Text style={styles.screenTitle}>
              Create your account so {inviterName} can see you're safe too.
            </Text>

            <View style={styles.authCard}>
              {authStep === "email" ? (
                <>
                  <Text style={styles.authLabel}>Your email</Text>
                  <TextInput
                    style={styles.authInput}
                    placeholder="you@example.com"
                    placeholderTextColor={BRAND.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    returnKeyType="done"
                    onSubmitEditing={handleEmailContinue}
                    editable={!loading}
                  />

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.ctaButton,
                      (!email.trim() || loading) && styles.ctaDisabled,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={handleEmailContinue}
                    disabled={!email.trim() || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={BRAND.white} size="small" />
                    ) : (
                      <Text style={styles.ctaButtonText}>
                        Continue with email
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.oauthBtn,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => handleSSO("oauth_google")}
                    disabled={loading}
                  >
                    <Feather name="globe" size={18} color={BRAND.text} />
                    <Text style={styles.oauthBtnText}>
                      Continue with Google
                    </Text>
                  </Pressable>

                  {Platform.OS === "ios" && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.oauthBtn,
                        styles.oauthBtnApple,
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => handleSSO("oauth_apple")}
                      disabled={loading}
                    >
                      <Feather
                        name="smartphone"
                        size={18}
                        color={BRAND.white}
                      />
                      <Text
                        style={[styles.oauthBtnText, { color: BRAND.white }]}
                      >
                        Continue with Apple
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.authBackBtn}
                    onPress={() => {
                      setAuthStep("email");
                      setOtp("");
                      setError("");
                    }}
                  >
                    <Feather
                      name="arrow-left"
                      size={16}
                      color={BRAND.primary}
                    />
                    <Text style={styles.authBackText}>Back</Text>
                  </Pressable>

                  <Text style={styles.authHeading}>Check your email</Text>
                  <Text style={styles.authSub}>
                    We sent a 6-digit code to{" "}
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        color: BRAND.text,
                      }}
                    >
                      {email}
                    </Text>
                  </Text>

                  <TextInput
                    style={[styles.authInput, styles.otpInput]}
                    placeholder="000000"
                    placeholderTextColor={BRAND.textMuted}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOtp}
                    editable={!loading}
                  />

                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.ctaButton,
                      (otp.length < 6 || loading) && styles.ctaDisabled,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={handleVerifyOtp}
                    disabled={otp.length < 6 || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={BRAND.white} size="small" />
                    ) : (
                      <Text style={styles.ctaButtonText}>Verify code</Text>
                    )}
                  </Pressable>

                  <Pressable
                    style={styles.resendBtn}
                    onPress={() => {
                      setOtp("");
                      setError("");
                      setAuthStep("email");
                    }}
                  >
                    <Text style={styles.resendText}>
                      Didn't receive it? Try again
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            <Text style={styles.legalText}>
              By continuing, you agree to Ollia's Terms of Service and Privacy
              Policy. Your location is never shared.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // =================== SCREEN 4: SUCCESS ===================
  function renderSuccess() {
    return (
      <View
        style={[
          styles.fullScreen,
          styles.centeredScreen,
          { paddingTop: topInset, paddingBottom: bottomInset + 24 },
        ]}
      >
        <Animated.View style={[styles.successContent, successCardStyle]}>
          {/* Pulsing green circle */}
          <View style={styles.pulseContainer}>
            <Animated.View style={[styles.pulseRing, pulseRingStyle]} />
            <View style={styles.greenCircle}>
              <Ionicons
                name="checkmark"
                size={40}
                color={BRAND.white}
              />
            </View>
          </View>

          <Text style={styles.successTitle}>{t("family.invite.youAreIn")} {"\uD83D\uDC9B"}</Text>

          <Text style={styles.successDescription}>{t("family.invite.youAreInSub")}</Text>

          <Pressable
              style={({ pressed }) => [
                styles.ctaButton,
                pressed && { opacity: 0.85 },
              ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setStep("firstValue");
            }}
          >
            <Text style={styles.ctaButtonText}>{t("family.invite.continue")}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // =================== SCREEN 5: FIRST VALUE ===================
  function renderFirstValue() {
    const member = inviterMember;
    const checkIn = getCheckInLabel(member?.lastCheckInAt ? new Date(member.lastCheckInAt) : null);
    const city = member?.region ?? "";

    return (
      <View
        style={[
          styles.fullScreen,
          { paddingTop: topInset + 32, paddingBottom: bottomInset + 24 },
        ]}
      >
        <Animated.View style={[styles.firstValueContent, contentStyle]}>
          <Text style={styles.firstValueHeadline}>
            This is what your family sees.
          </Text>

          {/* Inviter status card */}
          <View style={styles.statusCard}>
            <View style={styles.statusCardHeader}>
              <View style={styles.statusCardAvatar}>
                <Text style={styles.statusCardAvatarText}>
                  {(member?.name ?? inviterName)[0]?.toUpperCase()}
                </Text>
              </View>
              <View style={styles.statusCardInfo}>
                <Text style={styles.statusCardName}>
                  {member?.name ?? inviterName}
                </Text>
                {city ? (
                  <Text style={styles.statusCardCity}>{city}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.statusCardBadgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: `${checkIn.color}20` },
                ]}
              >
                <Feather
                  name={checkIn.tone === "fresh" ? "check-circle" : "alert-circle"}
                  size={12}
                  color={checkIn.color}
                />
                <Text style={[styles.statusBadgeText, { color: checkIn.color }]}>
                  {checkIn.text}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.privacyReminder}>
            <Feather name="shield" size={14} color={BRAND.textMuted} />
            <Text style={styles.privacyReminderText}>
              No location, no messages — just a quiet signal of safety.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              router.replace("/(tabs)");
            }}
          >
            <Text style={styles.ctaButtonText}>Go to my circle</Text>
            <Feather name="arrow-right" size={18} color={BRAND.white} />
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // =================== RENDER ===================
  switch (step) {
    case "welcome":
      return renderWelcome();
    case "identity":
      return renderIdentity();
    case "signup":
      return renderSignup();
    case "success":
      return renderSuccess();
    case "firstValue":
      return renderFirstValue();
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: 28,
  },
  centeredScreen: {
    alignItems: "center",
    justifyContent: "center",
  },
  screenContainer: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },

  // ---------- Back button ----------
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
    marginBottom: 24,
  },

  // ---------- Screen 1: Welcome ----------
  welcomeContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  wordmark: {
    fontSize: 46,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    letterSpacing: -1.5,
    marginBottom: 24,
  },
  welcomeAvatarWrap: {
    marginBottom: 8,
  },
  welcomeAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: BRAND.primary,
  },
  welcomeAvatarText: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
    lineHeight: 36,
  },
  welcomeDescription: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 12,
  },

  // ---------- Screen 2: Identity ----------
  screenTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    lineHeight: 32,
    marginBottom: 24,
  },
  nameInput: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    marginBottom: 20,
  },

  // ---------- Screen 3: Sign up ----------
  authCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    gap: 12,
    marginBottom: 16,
  },
  authLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
  },
  authInput: {
    backgroundColor: BRAND.backgroundDeep,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 28,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 8,
  },
  authBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  authBackText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  authHeading: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  authSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 20,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BRAND.borderLight,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BRAND.border,
    backgroundColor: BRAND.backgroundDeep,
  },
  oauthBtnApple: {
    backgroundColor: "#1C1C1E",
    borderColor: "#1C1C1E",
  },
  oauthBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.primary,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    textAlign: "center",
  },
  legalText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },

  // ---------- Screen 4: Success ----------
  successContent: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 8,
    width: "100%",
  },
  pulseContainer: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  pulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: BRAND.statusGreen,
  },
  greenCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BRAND.statusGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
  },
  successDescription: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 8,
  },

  // ---------- Screen 5: First Value ----------
  firstValueContent: {
    flex: 1,
    gap: 20,
  },
  firstValueHeadline: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    lineHeight: 34,
    marginBottom: 8,
  },
  statusCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  statusCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusCardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.primary,
  },
  statusCardAvatarText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  statusCardInfo: {
    flex: 1,
    gap: 2,
  },
  statusCardName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  statusCardCity: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
  },
  statusCardBadgeRow: {
    flexDirection: "row",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  statusCardTime: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  privacyReminder: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  privacyReminderText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
    lineHeight: 19,
  },

  // ---------- Shared CTA ----------
  ctaButton: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    borderRadius: 16,
    width: "100%",
    marginTop: 8,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaButtonText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
    textAlign: "center",
  },
});
