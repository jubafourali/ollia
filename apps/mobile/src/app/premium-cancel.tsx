import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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

export default function PremiumCancelScreen() {
  const insets = useSafeAreaInsets();

  const iconScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    iconScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    contentOpacity.value = withDelay(250, withTiming(1, { duration: 350 }));
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <View style={styles.inner}>
        <Reanimated.View style={iconStyle}>
          <View style={styles.iconRing}>
            <Feather name="heart" size={32} color={BRAND.primary} />
          </View>
        </Reanimated.View>

        <Reanimated.View style={[styles.textBlock, contentStyle]}>
          <Text style={styles.title}>No worries</Text>
          <Text style={styles.subtitle}>
            Ollia is still here for you and your family. You can upgrade any time from Settings.
          </Text>
        </Reanimated.View>
      </View>

      <Reanimated.View style={[styles.footer, contentStyle]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={styles.backBtnText}>Back to Ollia</Text>
        </Pressable>
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
    gap: 24,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: `${BRAND.primary}12`,
    borderWidth: 2,
    borderColor: `${BRAND.primary}35`,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: 10,
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
    paddingHorizontal: 8,
  },
  footer: {
    alignItems: "center",
  },
  backBtn: {
    backgroundColor: BRAND.primary,
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
