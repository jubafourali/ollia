import React from "react";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import BRAND from "@/constants/colors";
import type { FamilyMember } from "@/context/FamilyContext";
import type { PresenceState } from "@/utils/presenceState";

type Props = {
  member: FamilyMember;
  presence: PresenceState;
  index?: number;
  highlighted?: boolean;
  onPress: () => void;
};

/**
 * A light, secondary card. The emotional experience lives in the world above —
 * these are the quiet supporting details: who, how they seem, a soft line of why.
 */
export function QuickFamilyCard({ member, presence, index = 0, highlighted, onPress }: Props) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(420)}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          highlighted && { borderColor: presence.ringColor, backgroundColor: `${presence.ringColor}0E` },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.left}>
          <View style={[styles.dot, { backgroundColor: presence.ringColor }]} />
          <View style={[styles.dotHalo, { backgroundColor: presence.ringColor }]} />
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {member.name}
            </Text>
            {member.pending ? (
              <Text style={styles.relation}>{t("myStatus.pending")}</Text>
            ) : member.relation ? (
              <Text style={styles.relation} numberOfLines={1}>
                {member.relation}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.label, { color: presence.ringColor }]}>{presence.label}</Text>
          <Text style={styles.context} numberOfLines={1}>
            {presence.contextLine}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: `${BRAND.backgroundCard}99`,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  left: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2,
  },
  dotHalo: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    opacity: 0.25,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    flexShrink: 1,
  },
  relation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  context: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
});
