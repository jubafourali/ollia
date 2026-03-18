import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type Props = {
  size: number;
  color: string;
  active: boolean;
};

export function HeartbeatRing({ size, color, active }: Props) {
  const scale1 = useSharedValue(1);
  const opacity1 = useSharedValue(0.6);
  const scale2 = useSharedValue(1);
  const opacity2 = useSharedValue(0.3);

  useEffect(() => {
    if (active) {
      scale1.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        false
      );
      opacity1.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1000 }),
          withTiming(0.6, { duration: 1000 })
        ),
        -1,
        false
      );
      scale2.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(1.8, { duration: 1200 }),
          withTiming(1, { duration: 300 })
        ),
        -1,
        false
      );
      opacity2.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500 }),
          withTiming(0, { duration: 1200 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        false
      );
    } else {
      scale1.value = withTiming(1);
      opacity1.value = withTiming(0);
      scale2.value = withTiming(1);
      opacity2.value = withTiming(0);
    }
  }, [active]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity2.value,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
          ring2Style,
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
          ring1Style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
  },
});
