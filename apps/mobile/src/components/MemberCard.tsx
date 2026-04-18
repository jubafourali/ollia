import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";
import type { FamilyMember } from "@/context/FamilyContext";
import { MemberAvatar } from "./MemberAvatar";
import { getCheckInLabel } from "@/utils/checkInLabel";

type Props = {
  member: FamilyMember;
  onPress: () => void;
};

export function MemberCard({ member, onPress }: Props) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const isMe = member.isMe;
  const checkIn = getCheckInLabel(member.lastCheckInAt);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { damping: 15 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 15 });
    }, 100);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const isPending = member.pending;

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          styles.card,
          animatedStyle,
          isMe && styles.cardMe,
        ]}
      >
        <View style={styles.avatarContainer}>
          <MemberAvatar
            name={member.name}
            avatar={member.avatar}
            size={52}
          />
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, isMe && styles.nameMe]}>
              {member.name}
            </Text>
            {isMe ? (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>{t("common.you")}</Text>
              </View>
            ) : (
              <Text style={styles.relation}>{member.relation}</Text>
            )}
          </View>
          <View style={styles.checkInRow}>
            {isPending ? (
              <>
                <Feather name="clock" size={12} color={BRAND.textMuted} />
                <Text style={[styles.checkInText, { color: BRAND.textMuted }]}>
                  {t("myStatus.pending")}
                </Text>
              </>
            ) : (
              <>
                <Feather
                  name={checkIn.tone === "fresh" ? "check-circle" : "alert-circle"}
                  size={12}
                  color={checkIn.color}
                />
                <Text style={[styles.checkInText, { color: checkIn.color }]}>
                  {checkIn.text}
                </Text>
              </>
            )}
          </View>
          {!isPending && member.region ? (
            <Text style={styles.time}>{member.region}</Text>
          ) : null}
        </View>

        <Feather name="chevron-right" size={18} color={isMe ? BRAND.primary : BRAND.textMuted} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
  },
  cardMe: {
    borderColor: `${BRAND.primary}50`,
    backgroundColor: `${BRAND.primary}08`,
  },
  avatarContainer: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  nameMe: {
    color: BRAND.primary,
  },
  youBadge: {
    backgroundColor: `${BRAND.primary}20`,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${BRAND.primary}40`,
  },
  youBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  relation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  checkInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  checkInText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
});
