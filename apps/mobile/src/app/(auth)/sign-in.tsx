import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BRAND from "@/constants/colors";

WebBrowser.maybeCompleteAuthSession();

type Step = "email" | "otp";
type AuthMode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [step, setStep] = useState<Step>("email");
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isLoaded = signInLoaded && signUpLoaded;

  async function handleEmailContinue() {
    if (!email.trim() || !isLoaded) return;
    setLoading(true);
    setError("");
    try {
      const si = await signIn!.create({ identifier: email.trim() });
      const factor = si.supportedFirstFactors?.find((f) => f.strategy === "email_code");
      if (factor && "emailAddressId" in factor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: factor.emailAddressId,
        });
        setMode("sign-in");
        setStep("otp");
      }
    } catch (e: any) {
      const code = e?.errors?.[0]?.code;
      if (code === "form_identifier_not_found") {
        try {
          await signUp!.create({ emailAddress: email.trim() });
          await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
          setMode("sign-up");
          setStep("otp");
        } catch (e2: any) {
          setError(e2?.errors?.[0]?.longMessage ?? t("onboarding.errorGeneric"));
        }
      } else {
        setError(e?.errors?.[0]?.longMessage ?? t("onboarding.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim() || !isLoaded) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "sign-in") {
        const result = await signIn!.attemptFirstFactor({
          strategy: "email_code",
          code: otp.trim(),
        });
        if (result.status === "complete") {
          await setSignInActive!({ session: result.createdSessionId });
          router.replace("/(tabs)");
        }
      } else {
        const result = await signUp!.attemptEmailAddressVerification({ code: otp.trim() });
        if (result.status === "complete") {
          await setSignUpActive!({ session: result.createdSessionId! });
          router.replace("/(tabs)");
        }
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? t("onboarding.errorCode"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSSO(strategy: "oauth_google" | "oauth_apple") {
    setLoading(true);
    setError("");
    try {
      const redirectUrl = Linking.createURL("/oauth-native-callback");
      const { createdSessionId, setActive } = await startSSOFlow({ strategy, redirectUrl });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? t("onboarding.errorSignInFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logo}>
          <Text style={styles.logoText}>
            Oll<Text style={{ color: BRAND.primary }}>ia</Text>
          </Text>
          <Text style={styles.logoTagline}>{t("onboarding.logoTagline")}</Text>
        </View>

        <View style={styles.card}>
          {step === "email" ? (
            <>
              <Text style={styles.heading}>{t("onboarding.welcome")}</Text>
              <Text style={styles.subheading}>
                {t("onboarding.signInSub")}
              </Text>

              <Text style={styles.label}>{t("onboarding.yourEmail")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("onboarding.emailPlaceholder")}
                placeholderTextColor={BRAND.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleEmailContinue}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!email.trim() || loading) && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleEmailContinue}
                disabled={!email.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color={BRAND.white} size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>{t("onboarding.continueEmail")}</Text>
                    <Feather name="arrow-right" size={18} color={BRAND.white} />
                  </>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t("onboarding.or")}</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={({ pressed }) => [styles.oauthBtn, pressed && { opacity: 0.8 }]}
                onPress={() => handleSSO("oauth_google")}
                disabled={loading}
              >
                <Feather name="globe" size={18} color={BRAND.text} />
                <Text style={styles.oauthBtnText}>{t("onboarding.continueGoogle")}</Text>
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
                  <Feather name="smartphone" size={18} color={BRAND.white} />
                  <Text style={[styles.oauthBtnText, { color: BRAND.white }]}>
                    {t("onboarding.continueApple")}
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Pressable
                style={styles.backBtn}
                onPress={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
              >
                <Feather name="arrow-left" size={18} color={BRAND.primary} />
                <Text style={styles.backText}>{t("onboarding.back")}</Text>
              </Pressable>

              <Text style={styles.heading}>{t("onboarding.checkEmail")}</Text>
              <Text style={styles.subheading}>
                {t("onboarding.codeSentTo")}{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: BRAND.text }}>
                  {email}
                </Text>
              </Text>

              <Text style={styles.label}>{t("onboarding.verificationCode")}</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="000000"
                placeholderTextColor={BRAND.textMuted}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerifyOtp}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (otp.length < 6 || loading) && styles.btnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleVerifyOtp}
                disabled={otp.length < 6 || loading}
              >
                {loading ? (
                  <ActivityIndicator color={BRAND.white} size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t("onboarding.verifyCode")}</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.resendBtn}
                onPress={() => {
                  setOtp("");
                  setError("");
                  setStep("email");
                }}
              >
                <Text style={styles.resendText}>{t("onboarding.didntReceive")}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.legal}>
          {t("onboarding.legal")}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    backgroundColor: BRAND.background,
    gap: 24,
  },
  logo: {
    alignItems: "center",
    gap: 6,
    paddingTop: 20,
    paddingBottom: 8,
  },
  logoText: {
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    letterSpacing: -1,
  },
  logoTagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    gap: 12,
  },
  heading: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    marginBottom: 2,
  },
  subheading: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
    marginBottom: -4,
  },
  input: {
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
  primaryBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  btnDisabled: {
    opacity: 0.45,
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
  error: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    textAlign: "center",
    marginVertical: -4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  backText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
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
  legal: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
