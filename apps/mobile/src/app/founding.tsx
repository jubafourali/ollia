import { router } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import {useTranslation} from "react-i18next";
import {useAuth} from "@clerk/clerk-expo";
import { useFamilyContext } from "@/context/FamilyContext";

const FOUNDING_CLAIMED_KEY = "@ollia_founding_claimed";

export default function FoundingScreen() {
  const insets = useSafeAreaInsets();
  const {t} = useTranslation();
  const starScale = useSharedValue(0);
  const starWiggle = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const { userId } = useAuth();
  const { dismissFounding } = useFamilyContext();

  useEffect(() => {
    starScale.value = withSpring(1, { damping: 8, stiffness: 110 });
    starWiggle.value = withDelay(
        700,
        withRepeat(
            withSequence(
                withTiming(1, { duration: 1400 }),
                withTiming(0, { duration: 1400 })
            ),
            -1,
            true
        )
    );
    contentOpacity.value = withDelay(250, withTiming(1, { duration: 500 }));
  }, []);

  const starStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: starScale.value },
      { rotate: `${starWiggle.value * 6 - 3}deg` },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  async function handleClaim() {
    try {
      if (userId) {
        await AsyncStorage.setItem(`${FOUNDING_CLAIMED_KEY}:${userId}`, "1");
      }
    } catch {}
    // Clear the reactive flag so _layout.tsx doesn't bounce us back here
    dismissFounding();
    router.replace("/(tabs)");
  }

  return (
      <View
          style={[
            styles.container,
            {
              paddingTop: insets.top + 24,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
      >
        <View style={styles.inner}>
          <Reanimated.View style={[styles.starWrap, starStyle]}>
            <View style={styles.starGlow}>
              <Text style={styles.starEmoji}>🌟</Text>
            </View>
          </Reanimated.View>

          <Reanimated.View style={[styles.textBlock, contentStyle]}>
            <Text style={styles.title}>{t("founding.title")}</Text>
            <Text style={styles.body}>{t("founding.body")}</Text>
          </Reanimated.View>
        </View>

        <Reanimated.View style={[styles.ctaWrap, contentStyle]}>
          <Pressable
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              onPress={handleClaim}
          >
            <Text style={styles.ctaText}>{t("founding.cta")}</Text>
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
    gap: 28,
  },
  starWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  starGlow: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: `${BRAND.primary}18`,
    borderWidth: 1.5,
    borderColor: `${BRAND.primary}35`,
    alignItems: "center",
    justifyContent: "center",
  },
  starEmoji: {
    fontSize: 64,
  },
  textBlock: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  ctaWrap: {
    paddingTop: 12,
  },
  cta: {
    backgroundColor: BRAND.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
    letterSpacing: 0.2,
  },
});