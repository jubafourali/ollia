import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";

type Props = { width: number; height: number };

/**
 * The Living World — a warm, abstract, atmospheric orb. Not a globe, not a map:
 * no borders, no labels, no countries. Soft-edged so presence nodes can rest
 * anywhere within its atmosphere. Everything breathes, almost imperceptibly.
 */
export function WorldBackdrop({ width, height }: Props) {
  const cx = width / 2;
  const cy = height / 2;
  const orbR = Math.max(width, height) * 0.62;

  // L1 — base orb breathing (1 → 1.01 → 1, ~10s).
  const breathe = useSharedValue(1);
  // L2 — geographic-hint layer oscillation (-3° → 3°, ~40s). Never a full spin.
  const sway = useSharedValue(0);
  // L3 — light drift phase (0 → 1, ~20s).
  const drift = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.01, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 20000, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    drift.value = withRepeat(
      withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(sway.value - 0.5) * 6}deg` }],
  }));

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (drift.value - 0.5) * 26 },
      { translateY: (drift.value - 0.5) * -16 },
    ],
    opacity: 0.5 + drift.value * 0.25,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* L4 — ambient warm halo behind everything */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <RadialGradient id="ambient" cx={cx} cy={cy} r={orbR * 1.2} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={BRAND.primary} stopOpacity="0.1" />
            <Stop offset="0.6" stopColor={BRAND.primary} stopOpacity="0.04" />
            <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={orbR * 1.2} fill="url(#ambient)" />
      </Svg>

      {/* L1 — base orb (breathing) */}
      <Animated.View style={[StyleSheet.absoluteFill, orbStyle]}>
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <RadialGradient
              id="orb"
              cx={cx - orbR * 0.18}
              cy={cy - orbR * 0.22}
              r={orbR}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#FBF5E8" stopOpacity="1" />
              <Stop offset="0.45" stopColor={BRAND.backgroundCard} stopOpacity="0.95" />
              <Stop offset="0.72" stopColor={BRAND.backgroundDeep} stopOpacity="0.7" />
              <Stop offset="1" stopColor={BRAND.backgroundDeep} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={cx} cy={cy} r={orbR} fill="url(#orb)" />
          {/* faint curvature shading at the lower-right to suggest a sphere */}
          <Ellipse
            cx={cx + orbR * 0.22}
            cy={cy + orbR * 0.28}
            rx={orbR * 0.7}
            ry={orbR * 0.62}
            fill={BRAND.backgroundDeep}
            opacity={0.12}
          />
        </Svg>
      </Animated.View>

      {/* L2 — geographic hints (very subtle, gently swaying) */}
      <Animated.View style={[StyleSheet.absoluteFill, hintStyle]}>
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Path
            d={`M ${cx - orbR * 0.42} ${cy - orbR * 0.18}
                q ${orbR * 0.18} ${-orbR * 0.16}, ${orbR * 0.34} ${-orbR * 0.02}
                q ${orbR * 0.1} ${orbR * 0.12}, ${-orbR * 0.04} ${orbR * 0.2}
                q ${-orbR * 0.2} ${orbR * 0.08}, ${-orbR * 0.3} ${-orbR * 0.02} Z`}
            fill={BRAND.textSecondary}
            opacity={0.06}
          />
          <Path
            d={`M ${cx + orbR * 0.06} ${cy + orbR * 0.04}
                q ${orbR * 0.16} ${-orbR * 0.06}, ${orbR * 0.3} ${orbR * 0.06}
                q ${orbR * 0.06} ${orbR * 0.16}, ${-orbR * 0.08} ${orbR * 0.24}
                q ${-orbR * 0.18} ${orbR * 0.04}, ${-orbR * 0.26} ${-orbR * 0.08} Z`}
            fill={BRAND.textSecondary}
            opacity={0.05}
          />
          <Path
            d={`M ${cx - orbR * 0.28} ${cy + orbR * 0.3}
                q ${orbR * 0.12} ${-orbR * 0.04}, ${orbR * 0.2} ${orbR * 0.04}
                q ${orbR * 0.03} ${orbR * 0.1}, ${-orbR * 0.06} ${orbR * 0.14}
                q ${-orbR * 0.12} ${orbR * 0.0}, ${-orbR * 0.16} ${-orbR * 0.08} Z`}
            fill={BRAND.textSecondary}
            opacity={0.05}
          />
        </Svg>
      </Animated.View>

      {/* L3 — soft warm light drift */}
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <RadialGradient
              id="lightdrift"
              cx={cx - orbR * 0.2}
              cy={cy - orbR * 0.24}
              r={orbR * 0.6}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={BRAND.primaryLight} stopOpacity="0.14" />
              <Stop offset="1" stopColor={BRAND.primaryLight} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={cx - orbR * 0.2} cy={cy - orbR * 0.24} r={orbR * 0.6} fill="url(#lightdrift)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
