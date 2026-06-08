import React, { useEffect } from "react";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";

type Props = {
  initial: string;
  ringColor: string;
  index?: number;
  size?: number;
  isSelf?: boolean;
  highlighted?: boolean;
  onPress?: () => void;
};

/**
 * A single living presence: soft warm halo → presence ring → avatar bubble.
 * Breathes on its own gentle rhythm, staggered so the circle never pulses in
 * lockstep. Tapping warms and enlarges it briefly. No bouncing, no playfulness.
 */
export function PresenceNode({
  initial,
  ringColor,
  index = 0,
  size = 50,
  isSelf = false,
  highlighted = false,
  onPress,
}: Props) {
  const pulse = useSharedValue(1);
  const press = useSharedValue(1);

  useEffect(() => {
    // 8–12s cycle, desynced by index so nodes don't breathe together.
    const duration = 8000 + (index % 5) * 900;
    pulse.value = withDelay(
      index * 420,
      withRepeat(
        withSequence(
          withTiming(1.03, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.sin) })
        ),
        -1
      )
    );
  }, [index]);

  const nodeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * press.value * (highlighted ? 1.08 : 1) }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: highlighted ? 0.9 : 0.55,
    transform: [{ scale: highlighted ? 1.15 : 1 }],
  }));

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    press.value = withSequence(
      withSpring(1.09, { damping: 12, stiffness: 160 }),
      withSpring(1, { damping: 14, stiffness: 140 })
    );
    onPress?.();
  };

  const bubble = size;
  const halo = size * 1.9;
  const ringPad = 4;

  return (
    <Pressable onPress={handlePress} hitSlop={10}>
      <Animated.View style={[styles.wrap, { width: halo, height: halo }, nodeStyle]}>
        {/* soft warm halo */}
        <Animated.View
          style={[
            styles.halo,
            { width: halo, height: halo, borderRadius: halo / 2, backgroundColor: ringColor },
            haloStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.halo,
            {
              width: halo * 0.66,
              height: halo * 0.66,
              borderRadius: halo,
              backgroundColor: ringColor,
              opacity: 0.18,
            },
          ]}
        />

        {/* presence ring */}
        <View
          style={{
            width: bubble + ringPad * 2,
            height: bubble + ringPad * 2,
            borderRadius: (bubble + ringPad * 2) / 2,
            borderWidth: 2,
            borderColor: ringColor,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${ringColor}1A`,
          }}
        >
          {/* avatar bubble */}
          <View
            style={[
              styles.bubble,
              {
                width: bubble,
                height: bubble,
                borderRadius: bubble / 2,
                backgroundColor: isSelf ? BRAND.primary : BRAND.backgroundCard,
              },
            ]}
          >
            <Text
              style={[
                styles.initial,
                { fontSize: bubble * 0.4, color: isSelf ? BRAND.white : BRAND.text },
              ]}
            >
              {initial}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    opacity: 0.5,
  },
  bubble: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7a6a4a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  initial: {
    fontFamily: "Inter_600SemiBold",
  },
});
