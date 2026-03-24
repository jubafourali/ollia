import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";

const UNLOCK_FEATURES = [
  { icon: "users", text: "Unlimited family members" },
  { icon: "navigation", text: "Travel mode — alert your circle when traveling" },
  { icon: "bell", text: "Smart inactivity alerts & push notifications" },
  { icon: "trending-up", text: "Activity patterns & check-in history" },
  { icon: "map-pin", text: "City-filtered safety alerts" },
  { icon: "shield", text: "Severity control & region alerts" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (plan: "monthly" | "annual") => Promise<void>;
  loading?: boolean;
};

export function UpgradeModal({ visible, onClose, onSelect, loading }: Props) {
  const insets = useSafeAreaInsets();
  const [selecting, setSelecting] = React.useState<"monthly" | "annual" | null>(null);

  const handleSelect = async (plan: "monthly" | "annual") => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelecting(plan);
    try {
      await onSelect(plan);
    } finally {
      setSelecting(null);
    }
  };

  const isLoading = loading || selecting !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={isLoading ? undefined : onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.starBadge}>
            <Feather name="star" size={16} color="#F59E0B" />
          </View>
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.tagline}>
            Keep your family close, wherever they are.
          </Text>
        </View>

        {/* Feature list */}
        <View style={styles.features}>
          {UNLOCK_FEATURES.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Feather name={f.icon as any} size={14} color="#F59E0B" />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <View style={styles.ctaSection}>
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnAnnual,
              pressed && { opacity: 0.88 },
              isLoading && styles.ctaBtnDisabled,
            ]}
            onPress={() => handleSelect("annual")}
            disabled={isLoading}
          >
            {selecting === "annual" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <View style={styles.ctaBtnLeft}>
                  <Text style={styles.ctaBtnTitle}>Annual</Text>
                  <Text style={styles.ctaBtnSub}>Save ~33%</Text>
                </View>
                <View style={styles.ctaBtnRight}>
                  <Text style={styles.ctaBtnPrice}>$79.99</Text>
                  <Text style={styles.ctaBtnPriceSub}>/year</Text>
                </View>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnMonthly,
              pressed && { opacity: 0.88 },
              isLoading && styles.ctaBtnDisabled,
            ]}
            onPress={() => handleSelect("monthly")}
            disabled={isLoading}
          >
            {selecting === "monthly" ? (
              <ActivityIndicator color={BRAND.primary} size="small" />
            ) : (
              <>
                <Text style={styles.ctaBtnMonthlyText}>Monthly</Text>
                <Text style={styles.ctaBtnMonthlyPrice}>$9.99 / month</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.legalNote}>
          Cancel anytime from your account settings. No hidden fees.
        </Text>

        {!isLoading && (
          <Pressable onPress={onClose} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: BRAND.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: BRAND.borderLight,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BRAND.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
  },
  starBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F59E0B18",
    borderWidth: 1.5,
    borderColor: "#F59E0B40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  features: {
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F59E0B12",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
    flex: 1,
    lineHeight: 19,
  },
  ctaSection: {
    gap: 10,
    marginBottom: 12,
  },
  ctaBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
  },
  ctaBtnAnnual: {
    backgroundColor: "#F59E0B",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ctaBtnMonthly: {
    backgroundColor: `${BRAND.primary}12`,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}40`,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaBtnLeft: {
    alignItems: "flex-start",
  },
  ctaBtnRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
    alignSelf: "center",
  },
  ctaBtnTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  ctaBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 1,
  },
  ctaBtnPrice: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  ctaBtnPriceSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    alignSelf: "flex-end",
    marginBottom: 2,
  },
  ctaBtnMonthlyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.primary,
  },
  ctaBtnMonthlyPrice: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.primary,
  },
  legalNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 15,
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dismissText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
});
