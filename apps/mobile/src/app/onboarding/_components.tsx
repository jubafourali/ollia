import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
    Dimensions,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import Animated, {
    Easing,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BRAND from "@/constants/colors";

const { width: SW, height: SH } = Dimensions.get("window");

// ── Progress indicator (animated pips) ───────────────────────────────────────

export function OnboardingProgress({ step, total }: { step: number; total: number }) {
    return (
        <View style={progressStyles.row}>
            {Array.from({ length: total }).map((_, i) => (
                <ProgressPip key={i} active={i === step - 1} done={i < step - 1} />
            ))}
        </View>
    );
}

function ProgressPip({ active, done }: { active: boolean; done: boolean }) {
    const width = useSharedValue(done || active ? (active ? 22 : 6) : 6);
    const opacity = useSharedValue(done || active ? 1 : 0.45);

    useEffect(() => {
        width.value = withSpring(active ? 22 : 6, { damping: 16, stiffness: 180 });
        opacity.value = withTiming(done || active ? 1 : 0.45, { duration: 220 });
    }, [active, done]);

    const style = useAnimatedStyle(() => ({
        width: width.value,
        opacity: opacity.value,
        backgroundColor: active || done ? BRAND.primary : BRAND.borderLight,
    }));

    return <Animated.View style={[progressStyles.pip, style]} />;
}

const progressStyles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
    pip: { height: 6, borderRadius: 3 },
});

// ── Staggered enter helper ───────────────────────────────────────────────────

export function StaggeredEnter({
    children,
    index = 0,
    style,
}: {
    children: React.ReactNode;
    index?: number;
    style?: ViewStyle;
}) {
    return (
        <Animated.View
            entering={FadeInDown.delay(index * 70).duration(420).springify().damping(18)}
            style={style}
        >
            {children}
        </Animated.View>
    );
}

// ── Warm gradient backdrop ───────────────────────────────────────────────────

function GradientBackdrop() {
    return (
        <Svg style={StyleSheet.absoluteFill} width={SW} height={SH} pointerEvents="none">
            <Defs>
                <SvgLinearGradient id="ob_bg" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0"    stopColor="#FCEFD9" />
                    <Stop offset="0.45" stopColor={BRAND.background} />
                    <Stop offset="1"    stopColor={BRAND.backgroundCard} />
                </SvgLinearGradient>
            </Defs>
            <Rect width={SW} height={SH} fill="url(#ob_bg)" />
        </Svg>
    );
}

// ── Container with gradient + progress + fade-in motion ──────────────────────

export function OnboardingContainer({
    children,
    step,
    total = 8,
    onBack,
}: {
    children: React.ReactNode;
    step: number;
    total?: number;
    onBack?: () => void;
}) {
    const insets = useSafeAreaInsets();
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(14);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <View style={containerStyles.root}>
            <GradientBackdrop />
            <View style={[containerStyles.header, { paddingTop: insets.top + 10 }]}>
                {onBack ? (
                    <Pressable onPress={onBack} hitSlop={12} style={containerStyles.back}>
                        <Feather name="chevron-left" size={20} color={BRAND.textSecondary} />
                    </Pressable>
                ) : (
                    <View style={containerStyles.back} />
                )}
                <OnboardingProgress step={step} total={total} />
            </View>
            <Animated.View style={[containerStyles.body, animStyle]}>
                {children}
            </Animated.View>
        </View>
    );
}

const containerStyles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BRAND.background },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: 4,
    },
    back: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
    body: { flex: 1 },
});

// ── Primary CTA — press scale + optional idle pulse ──────────────────────────

export function PrimaryButton({
    label,
    onPress,
    disabled,
    style,
    icon,
    pulse,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    style?: ViewStyle;
    icon?: keyof typeof Feather.glyphMap;
    /** Soft idle pulse to draw the eye on conversion CTAs */
    pulse?: boolean;
}) {
    const scale = useSharedValue(1);
    const pulseScale = useSharedValue(1);

    useEffect(() => {
        if (!pulse || disabled) {
            pulseScale.value = withTiming(1, { duration: 200 });
            return;
        }
        pulseScale.value = withRepeat(
            withTiming(1.025, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
        );
    }, [pulse, disabled]);

    const handlePress = () => {
        if (disabled) return;
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value * pulseScale.value }],
    }));

    return (
        <Animated.View style={animStyle}>
            <Pressable
                onPress={handlePress}
                disabled={disabled}
                onPressIn={() => {
                    if (!disabled) scale.value = withTiming(0.98, { duration: 120 });
                }}
                onPressOut={() => {
                    scale.value = withTiming(1, { duration: 180 });
                }}
                style={[buttonStyles.primary, disabled && buttonStyles.disabled, style]}
            >
                {!disabled && <View style={buttonStyles.innerHighlight} pointerEvents="none" />}
                <Text style={[buttonStyles.primaryText, disabled && buttonStyles.disabledText]}>
                    {label}
                </Text>
                {icon && (
                    <Feather
                        name={icon}
                        size={18}
                        color={disabled ? BRAND.textMuted : BRAND.white}
                        style={{ marginLeft: 8 }}
                    />
                )}
            </Pressable>
        </Animated.View>
    );
}

// ── Secondary CTA (text link) ────────────────────────────────────────────────

export function SecondaryButton({
    label,
    onPress,
    style,
    quiet,
}: {
    label: string;
    onPress: () => void;
    style?: ViewStyle;
    /** Quieter styling for demoted skip actions */
    quiet?: boolean;
}) {
    return (
        <Pressable
            onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onPress();
            }}
            style={({ pressed }) => [
                buttonStyles.secondary,
                pressed && { opacity: 0.6 },
                style,
            ]}
        >
            <Text style={[buttonStyles.secondaryText, quiet && buttonStyles.quietText]}>
                {label}
            </Text>
        </Pressable>
    );
}

const buttonStyles = StyleSheet.create({
    primary: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BRAND.primary,
        paddingVertical: 17,
        paddingHorizontal: 24,
        borderRadius: 16,
        shadowColor: BRAND.primaryDark,
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
        overflow: "hidden",
    },
    innerHighlight: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    primaryText: {
        fontSize: 16,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.white,
        letterSpacing: 0.2,
    },
    disabled: {
        backgroundColor: BRAND.borderLight,
        shadowOpacity: 0,
        elevation: 0,
    },
    disabledText: { color: BRAND.textMuted },
    secondary: {
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryText: {
        fontSize: 14,
        fontFamily: "Inter_500Medium",
        color: BRAND.textSecondary,
        letterSpacing: 0.2,
    },
    quietText: {
        fontSize: 13,
        fontFamily: "Inter_400Regular",
        color: BRAND.textMuted,
    },
});

// ── Soft breathing wrapper for illustrations ─────────────────────────────────

export function BreathingView({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: ViewStyle;
}) {
    const breath = useSharedValue(1);

    useEffect(() => {
        breath.value = withRepeat(
            withTiming(1.035, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: breath.value }],
        opacity: 0.92 + (breath.value - 1) * 2,
    }));

    return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}
