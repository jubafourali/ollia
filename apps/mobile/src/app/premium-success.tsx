import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";

export default function PremiumSuccessScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { syncSubscription } = useFamilyContext();

  const features = [
    t("premiumSuccess.features.unlimitedMembers"),
    t("premiumSuccess.features.travelMode"),
    t("premiumSuccess.features.smartAlerts"),
    t("premiumSuccess.features.cityAlerts"),
    t("premiumSuccess.features.activityPatterns"),
  ];
  const [synced, setSynced] = useState(false);
  const syncedRef = useRef(false);

  // Entrance animations
  const iconScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    // Animate in
    iconScale.value = withSpring(1, { damping: 10, stiffness: 120 });
    contentOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));

    // Sync subscription from server once
    if (!syncedRef.current) {
      syncedRef.current = true;
      syncSubscription().finally(() => setSynced(true));
    }
  }, []);

  function handleContinue() {
    router.replace("/(tabs)/settings");
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.inner}>
        <Reanimated.View style={[styles.iconWrap, iconStyle]}>
          <View style={styles.iconRing}>
            <Feather name="star" size={36} color="#F59E0B" />
          </View>
        </Reanimated.View>

        <Reanimated.View style={[styles.textBlock, contentStyle]}>
          <Text style={styles.title}>{t("premiumSuccess.title")}</Text>
          <Text style={styles.subtitle}>
            {t("premiumSuccess.subtitle")}
          </Text>

          <View style={styles.featureList}>
            {features.map((f, i) => (
              <View key={f} style={styles.featureRow}>
                <View style={styles.checkWrap}>
                  <Feather name="check" size={13} color="#F59E0B" />
                </View>
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </Reanimated.View>
      </View>

      <Reanimated.View style={[styles.footer, contentStyle]}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.88 }]}
          onPress={handleContinue}
        >
          <Text style={styles.continueBtnText}>{t("premiumSuccess.continue")}</Text>
          <Feather name="arrow-right" size={17} color="#fff" />
        </Pressable>
        <Text style={styles.footerNote}>
          {t("premiumSuccess.footerNote")}
        </Text>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.background,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  iconWrap: {
    alignItems: "center",
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#F59E0B18",
    borderWidth: 2,
    borderColor: "#F59E0B50",
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 4,
  },
  featureList: {
    gap: 10,
    width: "100%",
    paddingHorizontal: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F59E0B15",
    borderWidth: 1,
    borderColor: "#F59E0B40",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
  },
  footer: {
    gap: 12,
    alignItems: "center",
  },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
  },
  continueBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
  },
});
