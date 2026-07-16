/**
 * DESTINATION: apps/mobile/src/app/(tabs)/index.tsx
 *
 * Thin tab-screen wrapper. Delegates all UI to FamilyCircleScreen.
 * Keeps existing modal logic (CheckIn, Invite, Upgrade, bgRefresh) intact.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { CheckInModal } from "@/components/CheckInModal";
import { InviteModal } from "@/components/InviteModal";
import { UpgradeModal } from "@/components/UpgradeModal";
import { FamilyCircleScreen } from "@/components/FamilyGlobe/FamilyCircleScreen";
import type { SafetyEvent } from "@/components/FamilyGlobe/FamilyCircleScreen";
import { trackReassuranceStateViewed } from "@/utils/analytics";

export default function FamilyTab() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    members,
    pendingCheckIn,
    respondToCheckIn,
    addMember,
    inviteCode,
    circleId,
    myProfile,
    setMyProfile,
    alerts,
    plan,
    travelMode,
    travelDestination,
    upgradePlan,
    bgRefreshDisabled,
  } = useFamilyContext();

  const [showInvite,        setShowInvite]        = useState(false);
  const [showUpgrade,       setShowUpgrade]        = useState(false);
  const [bgBannerDismissed, setBgBannerDismissed] = useState(false);

  // ★ Aha: Worrier sees at least one loved one's reassurance state on Family.
  useEffect(() => {
    if (!circleId) return;
    const lovedOnes = members.filter((m) => !m.isMe && !m.pending);
    if (lovedOnes.length === 0) return;
    trackReassuranceStateViewed({
      circleId,
      memberId: lovedOnes[0].id,
      // members list is peers-only; +1 for self → total circle size.
      memberCount: lovedOnes.length + 1,
    }).catch(() => {});
  }, [circleId, members]);

  // Map SAIAE alert cards → the SafetyEvent shape FamilyCircleScreen renders.
  // Risk level (not raw source severity) drives the visual treatment, and the
  // backend's vetted calm sentence is the body copy.
  const events: SafetyEvent[] = useMemo(() =>
          (alerts ?? []).map((a) => {
            const severity: SafetyEvent["severity"] =
                a.effectiveRisk === "IMPORTANT_DISRUPTION" ? "high"
                    : a.effectiveRisk === "STAY_AWARE" ? "medium" : "low";
            const origins = a.card.sources.filter(s => !s.originSource).map(s => s.name);
            return {
              id:             a.eventId,
              icon:           severity === "high" ? "⚠️" : severity === "medium" ? "📍" : "💛",
              title:          a.card.eventLabel,
              source:         origins.length ? origins.join(" & ") : "verified sources",
              region:         "",
              severity,
              sentence:       a.card.sentence,
              confidenceTier: a.card.confidenceTier,
            };
          }),
      [alerts],
  );

  const meRegion = travelMode && travelDestination
      ? travelDestination
      : myProfile?.region ?? "";

  const handleInvite = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInvite(true);
  }, []);

  const handleMemberPress = useCallback((id: string) => {
    router.push({ pathname: "/member/[id]", params: { id } });
  }, []);

  return (
      <View style={styles.root}>
        {/* Background refresh banner — sits above everything, dismissible */}
        {bgRefreshDisabled && !bgBannerDismissed && (
            <View style={[styles.bgBanner, { top: insets.top }]}>
              <Feather name="refresh-cw" size={13} color={BRAND.primary} />
              <Text style={styles.bgBannerText}>
                Enable Background Refresh so your family sees you're active
              </Text>
              <Pressable
                  style={styles.bgBannerBtn}
                  onPress={() => Linking.openURL("app-settings:")}
              >
                <Text style={styles.bgBannerBtnText}>Settings</Text>
              </Pressable>
              <Pressable onPress={() => setBgBannerDismissed(true)} hitSlop={8}>
                <Feather name="x" size={15} color={BRAND.textMuted} />
              </Pressable>
            </View>
        )}

        {/* Main screen — FamilyCircleScreen owns all the UI */}
        <FamilyCircleScreen
            members={members}
            meRegion={meRegion}
            events={events}
            onInvite={handleInvite}
            onMemberPress={handleMemberPress}
        />

        {/* Modals — layered on top of everything */}
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
            circleId={circleId}
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
            onNameSet={(name) =>
                setMyProfile({
                  name,
                  region:   myProfile?.region   ?? "",
                  timezone: myProfile?.timezone,
                })
            }
        />
      </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  bgBanner: {
    position: "absolute",
    left: 0, right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    backgroundColor: BRAND.statusYellowLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${BRAND.statusYellow}40`,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  bgBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.textSecondary,
    lineHeight: 17,
  },
  bgBannerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: BRAND.primary,
    borderRadius: 8,
  },
  bgBannerBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
});