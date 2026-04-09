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
import { getStatusColor, getStatusLabel } from "./StatusDot";
import { formatTimeAgo } from "@/utils/time";

type Props = {
  member: FamilyMember;
  onPress: () => void;
};

export function MemberCard({ member, onPress }: Props) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const statusColor = getStatusColor(member.status);
  const statusLabel = getStatusLabel(member.status);
  const isMe = member.isMe;

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

  const timeAgo = formatTimeAgo(member.lastSeen);
  const isActive = member.status === "active";
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
            status={member.status}
            size={52}
            showRing={isActive}
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
          <View style={styles.statusRow}>
            {isPending ? (
              <View style={[styles.statusPill, { backgroundColor: "#F3F4F6" }]}>
                <Feather name="clock" size={11} color={BRAND.textMuted} />
                <Text style={[styles.statusText, { color: BRAND.textMuted }]}>
                  {t("myStatus.pending")}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
                <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>
          {!isPending && (
            <Text style={styles.time}>{timeAgo} · {member.region}</Text>
          )}
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  time: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
});
