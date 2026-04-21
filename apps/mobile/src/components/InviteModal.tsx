import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

  const {t} = useTranslation();

  const RELATION_KEYS = [
    { key: "Mother", label: t("invite.relations.Mother") },
    { key: "Father", label: t("invite.relations.Father") },
    { key: "Sister", label: t("invite.relations.Sister") },
    { key: "Brother", label: t("invite.relations.Brother") },
    { key: "Partner", label: t("invite.relations.Partner") },
    { key: "Child", label: t("invite.relations.Child") },
    { key: "Friend", label: t("invite.relations.Friend") },
    { key: "Other", label: t("invite.relations.Other") },
  ];

  const needsName = !myProfile?.name || myProfile.name === "User";

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
    const ownerName = encodeURIComponent(myProfile?.name || editingName.trim() || "Someone");
    return `https://ollia.app/invite?token=${inviteCode}&name=${ownerName}`;
  }

  async function handleShare() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const link = buildInviteLink();
    const name = myProfile?.name?.trim() || editingName.trim() || "Someone";
    try {
      await Share.share({
        message: `${name} cares about you \u{1F49B}\n\nThey're using Ollia to quietly make sure everyone is okay.\n\nJoin their circle:\n${link}`,
        title: t("invite.shareSheetTitle"),
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
          <Text style={styles.headerTitle}>{t("invite.title")}</Text>
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
            <Text style={styles.inviteHeroTitle}>{t("invite.smartLink")}</Text>
            <Text style={styles.inviteHeroSub}>
              {t("invite.smartLinkSub", { name: myProfile?.name ?? "your" })}
            </Text>
          </View>

          {needsName && (
            <View style={styles.namePrompt}>
              <Text style={styles.namePromptLabel}>{t("invite.namePrompt")}</Text>
              <Text style={styles.namePromptHint}>
                {t("invite.namePromptHint")}
              </Text>
              <TextInput
                style={styles.nameInput}
                placeholder={t("settings.namePlaceholder")}
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
                  <Text style={styles.nameConfirmText}>{t("invite.thatsMe")}</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>{t("invite.relationLabel")}</Text>
          <View style={styles.chips}>
            {RELATION_KEYS.map((r) => (
                <Pressable
                    key={r.key}
                    style={[styles.chip, relation === r.key && styles.chipSelected]}
                    onPress={() => setRelation(r.key)}
                >
                  <Text
                      style={[
                        styles.chipText,
                        relation === r.key && styles.chipTextSelected,
                      ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
            ))}
          </View>

          <View style={styles.linkPreview}>
            <Feather name="link" size={14} color={BRAND.textMuted} />
            <Text style={styles.linkPreviewText} numberOfLines={1}>
              ollia.app/invite?token={inviteCode ? inviteCode.substring(0, 8) : "…"}…
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleShare}
            testID="share-link-btn"
          >
            <Feather name="share-2" size={18} color={BRAND.white} />
            <Text style={styles.primaryBtnText}>{t("invite.shareLink")}</Text>
          </Pressable>
          <View style={styles.privacyNote}>
            <Feather name="shield" size={13} color={BRAND.textMuted} />
            <Text style={styles.privacyText}>
              {t("invite.privacyNote")}
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
