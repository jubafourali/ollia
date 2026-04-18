import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { requestLocationPermission, hasBackgroundLocationPermission } from "@/services/backgroundActivity";
import { CityPicker } from "@/components/CityPicker";
import { UpgradeModal } from "@/components/UpgradeModal";
import { getCheckInLabel } from "@/utils/checkInLabel";

function HeartbeatTimer({ lastSeen }: { lastSeen: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.floor((Date.now() - lastSeen.getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSeen]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const { t } = useTranslation();

  const label =
    elapsed < 60
      ? `${secs}s ago`
      : mins < 60
      ? `${mins}m ${secs}s ago`
      : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;

  const color =
    elapsed < 60 ? BRAND.statusGreen : elapsed < 300 ? BRAND.primary : "#EF4444";

  return (
    <Text style={[styles.timerText, { color }]}>
      {t("myStatus.lastHeartbeat", { elapsed: label })}
    </Text>
  );
}

export default function MyStatusScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    heartbeatIntervalLabel,
    myLastSeen,
    sendHeartbeat,
    members,
    myProfile,
    isRegistered,
    refreshCircle,
    travelMode,
    travelDestination,
    setTravelMode,
    patterns,
    plan,
    upgradePlan,
    locationPermissionMissing,
  } = useFamilyContext();
  // Local heartbeat sends are human check-ins, so myLastSeen doubles as
  // the local "lastCheckInAt" for the current user. The server-side value is
  // authoritative, but myLastSeen updates immediately on tap.
  const myLastCheckIn = myLastSeen.getTime() > 0 ? myLastSeen : null;
  const checkIn = getCheckInLabel(myLastCheckIn);
  const statusColor = checkIn.color;
  const isActive = checkIn.tone === "fresh";
  const [refreshing, setRefreshing] = useState(false);
  const [showTravelInput, setShowTravelInput] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);

  // Show location prompt when permission is missing; hide when granted
  useEffect(() => {
    if (!locationPermissionMissing) {
      setLocationPromptVisible(false);
      return;
    }
    setLocationPromptVisible(true);
  }, [locationPermissionMissing]);

  const isPremium = plan === "premium";

  const scale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (isActive) {
      scale.value = withRepeat(
        withSequence(
          withSpring(1.05, { damping: 4 }),
          withSpring(1, { damping: 6 })
        ),
        -1,
        false
      );
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1200 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1200 }),
          withTiming(0.5, { duration: 800 })
        ),
        -1,
        false
      );
    } else {
      scale.value = withTiming(1);
      ringScale.value = withTiming(1);
      ringOpacity.value = withTiming(0);
    }
  }, [isActive]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const handleHeartbeat = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    sendHeartbeat();
    scale.value = withSequence(
      withSpring(1.3, { damping: 3 }),
      withSpring(1, { damping: 6 })
    );
  };

  async function handleRefresh() {
    setRefreshing(true);
    await refreshCircle();
    setRefreshing(false);
  }

  const handleTravelToggle = async (on: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (on) {
      setShowTravelInput(true);
    } else {
      setShowTravelInput(false);
      await setTravelMode(false);
    }
  };

  const handleCitySelect = async (displayName: string, _timezone?: string) => {
    setShowTravelInput(false);
    await setTravelMode(true, displayName);
  };

  const handleTravelCancel = async () => {
    setShowTravelInput(false);
    await setTravelMode(false);
  };

  const watchers = members.filter((m) => !m.isMe);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topInset }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={BRAND.primary}
        />
      }
    >
      <Text style={styles.title}>{t("myStatus.title")}</Text>
      <Text style={styles.subtitle}>{t("myStatus.subtitle")}</Text>

      <View style={styles.heroSection}>
        <Pressable onPress={handleHeartbeat}>
          <View style={styles.heartWrapper}>
            <Reanimated.View
              style={[styles.ring, { borderColor: statusColor }, ringStyle]}
            />
            <Reanimated.View
              style={[
                styles.heartBg,
                {
                  backgroundColor: `${statusColor}18`,
                  borderColor: `${statusColor}50`,
                },
                heartStyle,
              ]}
            >
              <Ionicons name="heart" size={52} color={statusColor} />
            </Reanimated.View>
          </View>
        </Pressable>

        <View style={styles.familySeesBlock}>
          <Text style={styles.familySeesLabel}>{t("checkIn.familySees")}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Feather
              name={checkIn.tone === "fresh" ? "check-circle" : "alert-circle"}
              size={14}
              color={statusColor}
            />
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {checkIn.text}
            </Text>
          </View>
        </View>

        {travelMode && travelDestination ? (
          <View style={styles.travelPill}>
            <Feather name="map-pin" size={12} color={BRAND.primary} />
            <Text style={styles.travelPillText}>{t("myStatus.travelingTo", { destination: travelDestination })}</Text>
          </View>
        ) : null}

        <HeartbeatTimer lastSeen={myLastSeen} />

        <Pressable
          style={({ pressed }) => [styles.heartbeatBtn, pressed && { opacity: 0.8 }]}
          onPress={handleHeartbeat}
          testID="send-heartbeat-btn"
        >
          <Ionicons name="heart" size={16} color={BRAND.white} />
          <Text style={styles.heartbeatBtnText}>{t("myStatus.sendHeartbeat")}</Text>
        </Pressable>
      </View>

      {locationPromptVisible && (
        <View style={styles.locationPermissionCard}>
          <Feather name="map-pin" size={16} color={BRAND.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationPermissionText}>
              Allow background location so Ollia can quietly update your status as you move. No location is ever stored.
            </Text>
            <View style={styles.locationPermissionActions}>
              <Pressable
                style={styles.locationPermissionEnableBtn}
                onPress={async () => {
                  const granted = await requestLocationPermission();
                  if (granted) {
                    setLocationPromptVisible(false);
                    return;
                  }
                  const ok = await hasBackgroundLocationPermission();
                  if (ok) {
                    setLocationPromptVisible(false);
                    return;
                  }
                  // Permanently denied — send to Settings.
                  // FamilyContext's foreground listener will update
                  // locationPermissionMissing when the user returns.
                  Linking.openURL("app-settings:");
                }}
              >
                <Text style={styles.locationPermissionEnableBtnText}>Enable</Text>
              </Pressable>
              <Pressable
                style={styles.locationPermissionDismissBtn}
                onPress={() => {
                  setLocationPromptVisible(false);
                }}
              >
                <Text style={styles.locationPermissionDismissBtnText}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {isPremium && patterns?.hasPattern && patterns.insight ? (
        <View style={styles.patternCard}>
          <Feather name="trending-up" size={15} color={BRAND.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.patternTitle}>{t("myStatus.activityPattern")}</Text>
            <Text style={styles.patternText}>{patterns.insight}</Text>
          </View>
        </View>
      ) : !isPremium ? (
        <Pressable style={styles.patternCardLocked} onPress={() => setShowUpgrade(true)}>
          <View style={styles.patternLockedIcon}>
            <Feather name="lock" size={14} color={BRAND.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.patternTitle}>{t("myStatus.activityPatterns")}</Text>
            <Text style={styles.patternText}>{t("myStatus.unlockPatterns")}</Text>
          </View>
          <Feather name="chevron-right" size={14} color={BRAND.textMuted} />
        </Pressable>
      ) : null}

      <View style={styles.connectionCard}>
        <View style={styles.connectionRow}>
          <View style={styles.connectionLeft}>
            <Feather name="server" size={16} color={isRegistered ? BRAND.statusGreen : BRAND.textMuted} />
            <Text style={styles.connectionLabel}>{t("myStatus.backendSync")}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: isRegistered ? `${BRAND.statusGreen}18` : `${BRAND.textMuted}18` }]}>
            <View style={[styles.pillDot, { backgroundColor: isRegistered ? BRAND.statusGreen : BRAND.textMuted }]} />
            <Text style={[styles.pillText, { color: isRegistered ? BRAND.statusGreen : BRAND.textMuted }]}>
              {isRegistered ? t("myStatus.connected") : t("myStatus.offline")}
            </Text>
          </View>
        </View>

        <View style={styles.connectionRow}>
          <View style={styles.connectionLeft}>
            <Feather name="activity" size={16} color={BRAND.primary} />
            <Text style={styles.connectionLabel}>{t("myStatus.activityDetection")}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${BRAND.primary}18` }]}>
            <View style={[styles.pillDot, { backgroundColor: BRAND.primary }]} />
            <Text style={[styles.pillText, { color: BRAND.primary }]}>{heartbeatIntervalLabel}</Text>
          </View>
        </View>

        <View style={styles.connectionRow}>
          <View style={styles.connectionLeft}>
            <Feather name="user" size={16} color={BRAND.textSecondary} />
            <Text style={styles.connectionLabel}>{t("myStatus.profile")}</Text>
          </View>
          <Text style={styles.connectionValue}>
            {myProfile?.name ?? t("myStatus.notSet")}
          </Text>
        </View>

        {myProfile?.region ? (
          <View style={styles.connectionRow}>
            <View style={styles.connectionLeft}>
              <Feather name="map-pin" size={16} color={BRAND.textSecondary} />
              <Text style={styles.connectionLabel}>{t("myStatus.region")}</Text>
            </View>
            <Text style={styles.connectionValue}>{myProfile.region}</Text>
          </View>
        ) : null}

        <View style={[styles.connectionRow, { borderBottomWidth: 0 }]}>
          <View style={styles.connectionLeft}>
            <Feather name="navigation" size={16} color={isPremium && travelMode ? BRAND.primary : BRAND.textSecondary} />
            <View>
              <Text style={styles.connectionLabel}>{t("myStatus.travelMode")}</Text>
              {isPremium && travelMode && travelDestination ? (
                <Text style={styles.travelSubtitle}>{travelDestination}</Text>
              ) : !isPremium ? (
                <Text style={styles.travelSubtitle}>{t("myStatus.premium")}</Text>
              ) : null}
            </View>
          </View>
          {isPremium ? (
            <Switch
              value={travelMode}
              onValueChange={handleTravelToggle}
              trackColor={{ false: BRAND.border, true: `${BRAND.primary}80` }}
              thumbColor={travelMode ? BRAND.primary : BRAND.backgroundCard}
            />
          ) : (
            <Pressable
              onPress={() => setShowUpgrade(true)}
              style={styles.lockBtn}
              testID="travel-lock-btn"
            >
              <Feather name="lock" size={16} color={BRAND.textMuted} />
            </Pressable>
          )}
        </View>

      </View>

      {showTravelInput && (
        <CityPicker
          value=""
          onChange={handleCitySelect}
          defaultOpen
          onCancel={handleTravelCancel}
          placeholder={t("myStatus.searchDestination")}
        />
      )}

      {!isPremium ? (
        <Pressable style={styles.smartAlertsLocked} onPress={() => setShowUpgrade(true)}>
          <Feather name="lock" size={14} color={BRAND.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.smartAlertsLockedTitle}>{t("myStatus.smartAlertsTitle")}</Text>
            <Text style={styles.smartAlertsLockedText}>
              {t("myStatus.smartAlertsLocked")}
            </Text>
          </View>
          <Feather name="chevron-right" size={14} color={BRAND.textMuted} />
        </Pressable>
      ) : null}

      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t("myStatus.whoCanSee")}
      </Text>
      {watchers.length === 0 ? (
        <View style={styles.emptyWatchers}>
          <Feather name="users" size={28} color={BRAND.border} />
          <Text style={styles.emptyWatchersText}>
            {t("myStatus.inviteFromFamily")}
          </Text>
        </View>
      ) : (
        watchers.slice(0, 6).map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={styles.memberInitial}>
              <Text style={styles.memberInitialText}>{m.avatar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={styles.memberRelation}>
                {m.relation}{m.travelMode && m.travelDestination ? ` · ${t("myStatus.travelingTo", { destination: m.travelDestination })}` : ""}
              </Text>
            </View>
            {m.pending ? (
              <View style={[styles.seenBadge, { backgroundColor: "#F3F4F6" }]}>
                <Feather name="clock" size={12} color={BRAND.textMuted} />
                <Text style={[styles.seenText, { color: BRAND.textMuted }]}>
                  {t("myStatus.pending")}
                </Text>
              </View>
            ) : (
              <View style={styles.seenBadge}>
                <Feather name="eye" size={13} color={BRAND.statusGreen} />
                <Text style={styles.seenText}>{t("myStatus.canSee")}</Text>
              </View>
            )}
          </View>
        ))
      )}

      <View style={styles.privacyCard}>
        <Feather name="shield" size={16} color={BRAND.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.privacyTitle}>{t("myStatus.privacyTitle")}</Text>
          <Text style={styles.privacyText}>
            {t("myStatus.privacyText")}
          </Text>
        </View>
      </View>

      <View style={{ height: Platform.OS === "web" ? 34 : 20 }} />

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onSelect={async (planType) => {
          await upgradePlan(planType);
          setShowUpgrade(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    marginBottom: 32,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  heartWrapper: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  ring: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
  },
  heartBg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  familySeesBlock: {
    alignItems: "center",
    gap: 6,
  },
  familySeesLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  travelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: `${BRAND.primary}12`,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  travelPillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  timerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  heartbeatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: BRAND.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    marginTop: 4,
  },
  heartbeatBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  patternCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: `${BRAND.primary}08`,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${BRAND.primary}25`,
    marginBottom: 16,
  },
  patternTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    marginBottom: 2,
  },
  patternText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 18,
  },
  connectionCard: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    marginBottom: 24,
    overflow: "hidden",
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
  },
  connectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  connectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  travelSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.primary,
    marginTop: 1,
  },
  connectionValue: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  sectionHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    marginBottom: 12,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  alertName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  alertLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
  },
  memberInitial: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: BRAND.border,
  },
  memberInitialText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  memberName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  memberRelation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  seenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${BRAND.statusGreen}15`,
  },
  seenText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.statusGreen,
  },
  emptyWatchers: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 24,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    marginBottom: 8,
  },
  emptyWatchersText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  patternCardLocked: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    marginBottom: 16,
  },
  patternLockedIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  lockBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  smartAlertsLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    marginBottom: 16,
  },
  smartAlertsLockedTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
    marginBottom: 1,
  },
  smartAlertsLockedText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    lineHeight: 16,
  },
  privacyCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: `${BRAND.primary}10`,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${BRAND.primary}28`,
    marginTop: 24,
  },
  privacyTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    marginBottom: 3,
  },
  privacyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 19,
  },
  locationPermissionCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: BRAND.statusYellowLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: `${BRAND.statusYellow}40`,
    marginBottom: 16,
  },
  locationPermissionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 19,
    marginBottom: 10,
  },
  locationPermissionActions: {
    flexDirection: "row",
    gap: 10,
  },
  locationPermissionEnableBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: BRAND.primary,
    borderRadius: 10,
  },
  locationPermissionEnableBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  locationPermissionDismissBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  locationPermissionDismissBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.textMuted,
  },
});
