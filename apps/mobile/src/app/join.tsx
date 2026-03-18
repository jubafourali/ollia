import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";

import BRAND from "@/constants/colors";
import { api, setAuthTokenGetter } from "@/utils/api";
import { CityPicker } from "@/components/CityPicker";
import { useFamilyContext } from "@/context/FamilyContext";

const CIRCLE_KEY = "@ollia_circle_v2";
const INVITE_CODE_KEY = "@ollia_invite_code_v2";
const PROFILE_KEY = "@ollia_my_profile";

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    code: string;
    owner: string;
    relation: string;
  }>();
  const { userId, getToken } = useAuth();
  const { reloadCircleFromStorage } = useFamilyContext();

  const inviteCode = params.code ?? "";
  const ownerName = decodeURIComponent(params.owner ?? "Someone");
  const relation = decodeURIComponent(params.relation ?? "Family");

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cardScale = useSharedValue(1);
  const successOpacity = useSharedValue(0);
  const successScale = useSharedValue(0.8);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const successStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successScale.value }],
  }));

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  async function handleJoin() {
    if (!name.trim() || loading || !userId) return;
    setLoading(true);
    setError("");

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      setAuthTokenGetter(getToken);

      await api.upsertUser({ id: userId, name: name.trim(), region: region.trim() || undefined });
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), region: region.trim() }));

      const circle = await api.joinCircle({
        inviteCode,
        userId,
        relation,
      });

      await AsyncStorage.setItem(CIRCLE_KEY, circle.id);
      await AsyncStorage.setItem(INVITE_CODE_KEY, circle.inviteCode);

      await api.sendHeartbeat(userId, "app_open");

      await reloadCircleFromStorage();

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      cardScale.value = withSpring(0.95, { damping: 12 });
      setTimeout(() => {
        cardScale.value = withSpring(1);
        setJoined(true);
        successOpacity.value = withTiming(1, { duration: 400 });
        successScale.value = withSpring(1, { damping: 12 });
      }, 150);
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("404") || msg.includes("not found")) {
        setError("This invite link is no longer valid.");
      } else if (msg.includes("PLAN_LIMIT") || msg.includes("Member limit")) {
        setError("This circle is full. Ask the owner to upgrade their plan.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      console.error("Join error:", e);
    } finally {
      setLoading(false);
    }
  }

  if (joined) {
    return (
      <View
        style={[
          styles.successContainer,
          { paddingTop: topInset, paddingBottom: bottomInset + 24 },
        ]}
      >
        <Animated.View style={[styles.successCard, successStyle]}>
          <View style={styles.successIconBg}>
            <Ionicons name="checkmark-circle" size={56} color={BRAND.statusGreen} />
          </View>
          <Text style={styles.successTitle}>You're in!</Text>
          <Text style={styles.successSub}>
            You've joined{" "}
            <Text style={{ fontFamily: "Inter_700Bold", color: BRAND.text }}>
              {ownerName}
            </Text>
            's circle.{"\n"}
            They'll see a quiet signal whenever you're active.
          </Text>

          <View style={styles.privacyCard}>
            <Feather name="shield" size={16} color={BRAND.primary} />
            <Text style={styles.privacyText}>
              Only your activity status is shared — never your exact location or what you're doing.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.openBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.openBtnText}>Open Ollia</Text>
            <Feather name="arrow-right" size={18} color={BRAND.white} />
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: topInset + 12, paddingBottom: bottomInset + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        >
          <Feather name="x" size={22} color={BRAND.textSecondary} />
        </Pressable>

        <Animated.View style={[styles.inviteCard, cardStyle]}>
          <View style={styles.avatarRow}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerAvatarText}>
                {ownerName[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={styles.linkIcon}>
              <Feather name="link-2" size={14} color={BRAND.primary} />
            </View>
          </View>
          <Text style={styles.inviteTitle}>{ownerName} invited you</Text>
          <Text style={styles.inviteSub}>
            Join their Ollia family circle to share a quiet signal that you're safe — no check-ins needed.
          </Text>
        </Animated.View>

        <Text style={styles.formLabel}>Your name</Text>
        <TextInput
          style={styles.input}
          placeholder="What should they call you?"
          placeholderTextColor={BRAND.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="next"
          editable={!loading}
        />

        <Text style={[styles.formLabel, { marginTop: 16 }]}>
          Your city{" "}
          <Text style={styles.optional}>(optional)</Text>
        </Text>
        <CityPicker value={region} onChange={setRegion} />

        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.privacyRow}>
            <Feather name="shield" size={13} color={BRAND.textMuted} />
            <Text style={styles.privacySmall}>
              Only your activity status is shared. Never your location.
            </Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.joinBtn,
            (!name.trim() || loading) && styles.joinBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleJoin}
          disabled={!name.trim() || loading}
        >
          <Ionicons name="heart" size={20} color={BRAND.white} />
          <Text style={styles.joinBtnText}>
            {loading ? "Joining…" : `Join ${ownerName}'s circle`}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.background },
  container: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  backBtn: {
    alignSelf: "flex-end",
    padding: 4,
    marginBottom: 16,
  },
  inviteCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}30`,
    marginBottom: 32,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ownerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.primary,
  },
  ownerAvatarText: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  linkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${BRAND.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: -8,
    bottom: -4,
    borderWidth: 1,
    borderColor: `${BRAND.primary}40`,
  },
  inviteTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
    marginTop: 8,
  },
  inviteSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  formLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    marginBottom: 8,
  },
  optional: {
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 20,
  },
  privacySmall: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
  },
  joinBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 17,
    borderRadius: 16,
  },
  joinBtnDisabled: {
    opacity: 0.45,
  },
  joinBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  successContainer: {
    flex: 1,
    backgroundColor: BRAND.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 14,
    width: "100%",
    borderWidth: 1.5,
    borderColor: `${BRAND.statusGreen}40`,
  },
  successIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${BRAND.statusGreen}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  successSub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 23,
  },
  privacyCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: `${BRAND.primary}10`,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: `${BRAND.primary}25`,
    width: "100%",
  },
  privacyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    flex: 1,
    lineHeight: 19,
  },
  openBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    marginTop: 4,
  },
  openBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
});
