import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback, useEffect } from "react";
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { MemberCard } from "@/components/MemberCard";
import { CheckInModal } from "@/components/CheckInModal";
import { InviteModal } from "@/components/InviteModal";
import { UpgradeModal } from "@/components/UpgradeModal";
import type { ApiSafetyEvent } from "@/utils/api";

function SkeletonCard() {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[skeletonStyles.card, { opacity }]}>
      <View style={skeletonStyles.row}>
        <View style={skeletonStyles.avatar} />
        <View style={skeletonStyles.lines}>
          <View style={skeletonStyles.lineLong} />
          <View style={skeletonStyles.lineShort} />
        </View>
      </View>
    </Animated.View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BRAND.borderLight,
  },
  lines: { flex: 1, gap: 8 },
  lineLong: {
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND.borderLight,
    width: "60%",
  },
  lineShort: {
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND.borderLight,
    width: "35%",
  },
});

const SEVERITY_COLORS: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#6B7280",
};

const SOURCE_META: Record<string, { label: string; url: string }> = {
  USGS: { label: "USGS", url: "https://earthquake.usgs.gov" },
  NOAA: { label: "NOAA", url: "https://www.weather.gov" },
  GDACS: { label: "GDACS", url: "https://www.gdacs.org" },
};

function SafetyEventBanner({ event }: { event: ApiSafetyEvent }) {
  const color = SEVERITY_COLORS[event.severity] ?? "#6B7280";
  const icon =
    event.type === "earthquake" ? "zap" :
    event.type === "weather" ? "cloud-lightning" :
    "alert-triangle";
  const sourceMeta = event.source ? SOURCE_META[event.source] : null;

  return (
    <Pressable
      style={[styles.eventBanner, { borderColor: `${color}40`, backgroundColor: `${color}0A` }]}
      onPress={() => {
        const url = event.sourceUrl ?? sourceMeta?.url;
        if (url) Linking.openURL(url).catch(() => {});
      }}
    >
      <View style={[styles.eventIconWrap, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventTitle, { color }]} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.eventMeta}>
          {sourceMeta ? (
            <View style={styles.eventSourceBadge}>
              <Feather name="shield" size={10} color="#059669" />
              <Text style={styles.eventSourceText}>{sourceMeta.label} Official</Text>
            </View>
          ) : null}
          {event.region ? (
            <Text style={styles.eventRegion} numberOfLines={1}>
              {event.region}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <View style={[styles.eventSeverity, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.eventSeverityText, { color }]}>
            {event.severity}
          </Text>
        </View>
        <Feather name="external-link" size={11} color={BRAND.textMuted} />
      </View>
    </Pressable>
  );
}

export default function FamilyScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    members,
    pendingCheckIn,
    respondToCheckIn,
    addMember,
    circleId,
    inviteCode,
    myProfile,
    setMyProfile,
    safetyEvents,
    plan,
    travelMode,
    travelDestination,
    isLoading,
    refreshCircle,
    refreshSafetyEvents,
    upgradePlan,
    bgRefreshDisabled,
  } = useFamilyContext();
  const [showInvite, setShowInvite] = useState(false);
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [bgBannerDismissed, setBgBannerDismissed] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await Promise.all([refreshCircle(), refreshSafetyEvents()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCircle, refreshSafetyEvents]);

  const sortedMembers = [...members].sort((a, b) => {
    if (a.isMe) return -1;
    if (b.isMe) return 1;
    return 0;
  });
  const checkedInTodayCount = members.filter((m) => {
    if (!m.lastCheckInAt) return false;
    const now = new Date();
    return (
      m.lastCheckInAt.getFullYear() === now.getFullYear() &&
      m.lastCheckInAt.getMonth() === now.getMonth() &&
      m.lastCheckInAt.getDate() === now.getDate()
    );
  }).length;
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const significantEvents = safetyEvents.filter(
    (e) => e.severity === "high" || e.severity === "medium"
  );
  // Fix: show all events when expanded (not capped at 5)
  const visibleEvents = eventsExpanded ? safetyEvents : significantEvents.slice(0, 2);
  const travelingMembers = members.filter((m) => m.travelMode);
  const hasLocation = !!(travelMode && travelDestination) || !!myProfile?.region;

  const atLimit = plan === "free" && members.length >= 3;

  // For free users: "Set your city" banner is a premium upsell
  // For premium users: show banner only if city not set
  const showCityBanner = plan !== "premium" || !hasLocation;
  const cityBannerIsUpsell = plan !== "premium";

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t("family.title")}</Text>
          <Text style={styles.subtitle}>
            {t("family.checkedInToday", { count: checkedInTodayCount, total: members.length })}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.75 }]}
          onPress={() => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            setShowInvite(true);
          }}
        >
          <Feather name="user-plus" size={20} color={BRAND.primary} />
        </Pressable>
      </View>

      {bgRefreshDisabled && !bgBannerDismissed && (
        <View style={styles.bgRefreshBanner}>
          <Feather name="refresh-cw" size={14} color={BRAND.primary} />
          <Text style={styles.bgRefreshText}>
            Enable Background Refresh in Settings so your family sees you're active
          </Text>
          <Pressable
            style={styles.bgRefreshSettingsBtn}
            onPress={() => Linking.openURL("app-settings:")}
          >
            <Text style={styles.bgRefreshSettingsBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable
            onPress={() => setBgBannerDismissed(true)}
            hitSlop={8}
          >
            <Feather name="x" size={16} color={BRAND.textMuted} />
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.list,
          Platform.OS === "web" && { paddingBottom: 34 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND.primary}
            colors={[BRAND.primary]}
          />
        }
      >
        <View style={styles.statusBanner}>
          <View style={styles.statusPulse}>
            <View style={[styles.pulseInner, { backgroundColor: BRAND.statusGreen }]} />
          </View>
          <Text style={styles.bannerText}>
            {t("family.watching")}
          </Text>
        </View>

        {travelingMembers.length > 0 && (
          <View style={styles.travelBanner}>
            <Feather name="map-pin" size={14} color={BRAND.primary} />
            <Text style={styles.travelText}>
              {t(
                travelingMembers.length === 1
                  ? "family.travelBanner_one"
                  : "family.travelBanner_other",
                { names: travelingMembers.map((m) => m.name).join(", ") }
              )}
            </Text>
          </View>
        )}

        {showCityBanner && (
          <Pressable
            style={styles.locationPrompt}
            onPress={() => {
              if (cityBannerIsUpsell) {
                setShowUpgrade(true);
              } else {
                router.push("/(tabs)/settings");
              }
            }}
          >
            <Feather name={cityBannerIsUpsell ? "lock" : "map-pin"} size={14} color={BRAND.primary} />
            <Text style={styles.locationPromptText}>
              {cityBannerIsUpsell
                ? hasLocation
                  ? t("family.cityBannerUpgrade", { city: myProfile?.region ?? "" })
                  : t("family.cityBannerNoCity")
                : t("family.cityBannerSet")}
            </Text>
            <Feather name="chevron-right" size={14} color={BRAND.primary} />
          </Pressable>
        )}

        {visibleEvents.length > 0 && (
          <View style={styles.eventsSection}>
            <View style={styles.eventsSectionHeader}>
              <Feather name="shield" size={14} color="#EF4444" />
              <Text style={styles.eventsSectionTitle}>{t("family.safetyAlerts")}</Text>
              {safetyEvents.length > 2 && (
                <Pressable onPress={() => setEventsExpanded((v) => !v)}>
                  <Text style={styles.eventsToggle}>
                    {eventsExpanded ? t("family.showLess") : t("family.showMore", { count: safetyEvents.length - 2 })}
                  </Text>
                </Pressable>
              )}
            </View>
            {visibleEvents.map((ev) => (
              <SafetyEventBanner key={ev.id} event={ev} />
            ))}
            <View style={styles.eventsFooter}>
              <Feather name="info" size={11} color={BRAND.textMuted} />
              <Text style={styles.eventsFooterText}>
                {t("family.footerNote", {
                  context:
                    plan === "premium" && hasLocation
                      ? t("family.footerPremiumCity", {
                          city: travelMode && travelDestination ? travelDestination : myProfile?.region,
                        })
                      : plan === "premium"
                      ? t("family.footerPremiumNoCity")
                      : t("family.footerFree"),
                })}
              </Text>
            </View>
          </View>
        )}

        {atLimit && (
          <View style={styles.limitBanner}>
            <Feather name="lock" size={14} color={BRAND.primary} />
            <Text style={styles.limitText}>
              {t("family.freeLimitBanner")}
            </Text>
          </View>
        )}

        {isLoading ? (
          <View style={{ gap: 0 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : members.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={48} color={BRAND.border} />
            <Text style={styles.emptyTitle}>{t("family.emptyTitle")}</Text>
            <Text style={styles.emptyText}>
              {t("family.emptyText")}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowInvite(true)} testID="invite-someone-btn">
              <Feather name="user-plus" size={16} color={BRAND.white} />
              <Text style={styles.emptyBtnText}>{t("family.inviteSomeone")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {sortedMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onPress={() =>
                  router.push({ pathname: "/member/[id]", params: { id: member.id } })
                }
              />
            ))}
            {!atLimit && (
              <Pressable
                style={({ pressed }) => [styles.inviteMore, pressed && { opacity: 0.7 }]}
                onPress={() => setShowInvite(true)}
              >
                <Feather name="user-plus" size={16} color={BRAND.primary} />
                <Text style={styles.inviteMoreText}>{t("family.inviteSomeone")}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <CheckInModal request={pendingCheckIn} onRespond={respondToCheckIn} />

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onSelect={async (planType) => {
          await upgradePlan(planType);
          setShowUpgrade(false);
        }}
      />

      <InviteModal
        visible={showInvite}
        onClose={() => setShowInvite(false)}
        inviteCode={inviteCode}
        myProfile={myProfile}
        onInviteSent={(name, relation) => {
          addMember({
            userId: "",
            name,
            relation,
            avatar: name[0]?.toUpperCase() ?? "?",
            region: t("family.invited"),
            pending: true,
          });
        }}
        onNameSet={(name) => setMyProfile({ name, region: myProfile?.region ?? "", timezone: myProfile?.timezone })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  greeting: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  inviteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${BRAND.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}40`,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    backgroundColor: `${BRAND.statusGreen}12`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${BRAND.statusGreen}30`,
  },
  statusPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: `${BRAND.statusGreen}40`,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.statusGreen,
    flex: 1,
  },
  travelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    backgroundColor: `${BRAND.primary}10`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${BRAND.primary}30`,
  },
  travelText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
    flex: 1,
  },
  eventsSection: {
    marginBottom: 14,
  },
  eventsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  eventsSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#EF4444",
    flex: 1,
  },
  eventsToggle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  eventBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  eventIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  eventTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
    flexWrap: "wrap",
  },
  eventSourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#05966912",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#05966930",
  },
  eventSourceText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  eventRegion: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  eventSeverity: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  eventSeverityText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  eventsFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 2,
  },
  eventsFooterText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
    lineHeight: 15,
  },
  locationPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${BRAND.primary}0C`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${BRAND.primary}28`,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
  },
  locationPromptText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  limitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    backgroundColor: `${BRAND.primary}10`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: `${BRAND.primary}40`,
  },
  limitText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.primary,
    flex: 1,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  emptyBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    backgroundColor: BRAND.primary,
    borderRadius: 14,
  },
  emptyBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  inviteMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: `${BRAND.primary}60`,
  },
  inviteMoreText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  bgRefreshBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: BRAND.statusYellowLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${BRAND.statusYellow}40`,
  },
  bgRefreshText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.textSecondary,
    lineHeight: 17,
  },
  bgRefreshSettingsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: BRAND.primary,
    borderRadius: 8,
  },
  bgRefreshSettingsBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
});
