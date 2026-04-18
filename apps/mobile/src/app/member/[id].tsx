import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { MemberAvatar } from "@/components/MemberAvatar";
import { useFamilyContext } from "@/context/FamilyContext";
import { getCheckInLabel } from "@/utils/checkInLabel";

export default function MemberDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { members, removeMember } = useFamilyContext();

  const member = members.find((m) => m.id === id);

  if (!member) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>{t("member.notFound")}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{t("member.goBack")}</Text>
        </Pressable>
      </View>
    );
  }

  const checkIn = getCheckInLabel(member.lastCheckInAt);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="chevron-left" size={26} color={BRAND.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            Alert.alert(
              t("member.removeMember"),
              t("member.removeMemberMsg", { name: member.name }),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("common.remove"),
                  style: "destructive",
                  onPress: async () => {
                    if (Platform.OS !== "web") {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                    try {
                      await removeMember(member.id);
                      router.back();
                    } catch {
                      Alert.alert(t("common.error"), t("member.failedRemove"));
                    }
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="user-minus" size={18} color={BRAND.statusRed} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <MemberAvatar
            name={member.name}
            avatar={member.avatar}
            size={88}
          />
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.relation}>{member.relation}</Text>

          <View style={[styles.statusBadge, { backgroundColor: `${checkIn.color}20` }]}>
            <Feather
              name={checkIn.tone === "fresh" ? "check-circle" : "alert-circle"}
              size={14}
              color={checkIn.color}
            />
            <Text style={[styles.statusBadgeText, { color: checkIn.color }]}>
              {checkIn.text}
            </Text>
          </View>
        </View>

        {member.region ? (
          <View style={styles.infoGrid}>
            <View style={[styles.infoBox, { flex: 1 }]}>
              <Feather name="map-pin" size={18} color={BRAND.primary} />
              <Text style={styles.infoBoxLabel}>{t("member.region")}</Text>
              <Text style={styles.infoBoxValue}>{member.region}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.statusCard}>
          <Ionicons name="heart-circle-outline" size={22} color={checkIn.color} />
          <Text style={styles.statusDetail}>{checkIn.text}</Text>
        </View>

        <View style={styles.privacyNote}>
          <Feather name="lock" size={14} color={BRAND.textMuted} />
          <Text style={styles.privacyText}>
            {t("member.privacyNote")}
          </Text>
        </View>
      </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 4,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${BRAND.statusRed}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.statusRed}30`,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  heroSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  name: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    marginTop: 10,
  },
  relation: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  infoBoxLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: BRAND.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoBoxValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  statusDetail: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
    flex: 1,
  },
  privacyNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    paddingHorizontal: 4,
  },
  privacyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: BRAND.background,
  },
  notFoundText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
});
