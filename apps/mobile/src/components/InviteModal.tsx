import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";
import type { MyProfile } from "@/context/FamilyContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  inviteCode: string;
  myProfile: MyProfile | null;
  onInviteSent: (pendingName: string, relation: string) => void;
  onNameSet?: (name: string) => void;
};

const RELATIONS = [
  "Mother",
  "Father",
  "Sister",
  "Brother",
  "Partner",
  "Child",
  "Friend",
  "Other",
];

export function InviteModal({
  visible,
  onClose,
  inviteCode,
  myProfile,
  onInviteSent,
  onNameSet,
}: Props) {
  const insets = useSafeAreaInsets();
  const [relation, setRelation] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingName, setEditingName] = useState("");
  const checkScale = useSharedValue(0);

  const needsName = !myProfile?.name;

  useEffect(() => {
    if (visible) {
      setRelation("");
      setLinkCopied(false);
      setEditingName("");
    }
  }, [visible]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  function buildInviteLink(): string {
    const ownerName = encodeURIComponent(myProfile?.name ?? "Someone");
    return Linking.createURL("/join", {
      queryParams: {
        code: inviteCode,
        owner: ownerName,
        relation: encodeURIComponent(relation || "Family"),
      },
    });
  }

  async function handleShare() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const link = buildInviteLink();
    const name = myProfile?.name ?? "Someone";
    try {
      await Share.share({
        message: `${name} cares about you \u{1F49B}\n\nThey're using Ollia to quietly make sure everyone is okay.\n\nJoin their circle:\n${link}`,
        title: "Join my Ollia circle",
      });
      if (relation) {
        onInviteSent(relation, relation);
      }
    } catch {}
  }

  async function handleCopyLink() {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const link = buildInviteLink();
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.default.setStringAsync(link);
    } catch {
      try {
        await navigator.clipboard.writeText(link);
      } catch {}
    }
    setLinkCopied(true);
    checkScale.value = withSpring(1, { damping: 10 });
    setTimeout(() => {
      setLinkCopied(false);
      checkScale.value = withSpring(0, { damping: 10 });
    }, 2500);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={22} color={BRAND.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Invite to circle</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inviteHero}>
            <View style={styles.inviteIconBg}>
              <Feather name="link-2" size={28} color={BRAND.primary} />
            </View>
            <Text style={styles.inviteHeroTitle}>Send them a smart link</Text>
            <Text style={styles.inviteHeroSub}>
              When they tap it, they'll be brought directly into{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: BRAND.text }}>
                {myProfile?.name ?? "your"}'s
              </Text>{" "}
              circle on Ollia.
            </Text>
          </View>

          {needsName && (
            <View style={styles.namePrompt}>
              <Text style={styles.namePromptLabel}>What's your name?</Text>
              <Text style={styles.namePromptHint}>
                So your invite feels personal, not like a random link.
              </Text>
              <TextInput
                style={styles.nameInput}
                placeholder="e.g. Sara, Juba"
                placeholderTextColor={BRAND.textMuted}
                value={editingName}
                onChangeText={setEditingName}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {editingName.trim().length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.nameConfirmBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    if (onNameSet && editingName.trim()) {
                      onNameSet(editingName.trim());
                    }
                  }}
                >
                  <Feather name="check" size={16} color={BRAND.white} />
                  <Text style={styles.nameConfirmText}>That's me</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>Their relation to you</Text>
          <View style={styles.chips}>
            {RELATIONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, relation === r && styles.chipSelected]}
                onPress={() => setRelation(r)}
              >
                <Text
                  style={[
                    styles.chipText,
                    relation === r && styles.chipTextSelected,
                  ]}
                >
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.linkPreview}>
            <Feather name="link" size={14} color={BRAND.textMuted} />
            <Text style={styles.linkPreviewText} numberOfLines={1}>
              ollia://join?code={inviteCode ? inviteCode.substring(0, 8) : "…"}…
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleShare}
          >
            <Feather name="share-2" size={18} color={BRAND.white} />
            <Text style={styles.primaryBtnText}>Share invite link</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.75 },
            ]}
            onPress={handleCopyLink}
          >
            {linkCopied ? (
              <Animated.View style={[styles.copyRow, checkStyle]}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={BRAND.statusGreen}
                />
                <Text style={[styles.secondaryBtnText, { color: BRAND.statusGreen }]}>
                  Link copied!
                </Text>
              </Animated.View>
            ) : (
              <View style={styles.copyRow}>
                <Feather name="copy" size={16} color={BRAND.textSecondary} />
                <Text style={styles.secondaryBtnText}>Copy link</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.privacyNote}>
            <Feather name="shield" size={13} color={BRAND.textMuted} />
            <Text style={styles.privacyText}>
              Only people with this link can join your circle. You can remove
              them anytime.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  closeBtn: {
    padding: 4,
  },
  form: {
    gap: 8,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
    marginBottom: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BRAND.backgroundCard,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  chipSelected: {
    backgroundColor: `${BRAND.primary}18`,
    borderColor: BRAND.primary,
  },
  chipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.textSecondary,
  },
  chipTextSelected: {
    color: BRAND.primaryDark,
    fontFamily: "Inter_600SemiBold",
  },
  inviteHero: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
  },
  inviteIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${BRAND.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}30`,
  },
  inviteHeroTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
  },
  inviteHeroSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  noProfileNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: `${BRAND.primary}10`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${BRAND.primary}25`,
    marginBottom: 4,
  },
  noProfileText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.primaryDark,
    flex: 1,
    lineHeight: 18,
  },
  namePrompt: {
    backgroundColor: `${BRAND.primary}08`,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}25`,
    marginBottom: 4,
    gap: 8,
  },
  namePromptLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  namePromptHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    lineHeight: 18,
  },
  nameInput: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
  },
  nameConfirmBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  nameConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  linkPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BRAND.borderLight,
    marginBottom: 4,
  },
  linkPreviewText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: BRAND.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BRAND.border,
    backgroundColor: BRAND.backgroundCard,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.textSecondary,
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  privacyNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 16,
    paddingHorizontal: 4,
  },
  privacyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    flex: 1,
    lineHeight: 18,
  },
});
