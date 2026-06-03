import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BRAND from "@/constants/colors";

// ── Progress indicator ────────────────────────────────────────────────────────

export function OnboardingProgress({ step, total }: { step: number; total: number }) {
    return (
        <View style={progressStyles.wrap}>
            <Text style={progressStyles.text}>
                {step} of {total}
            </Text>
        </View>
    );
}

const progressStyles = StyleSheet.create({
    wrap: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
    text: {
        fontSize: 12,
        fontFamily: "Inter_500Medium",
        color: BRAND.textMuted,
        letterSpacing: 0.4,
    },
});

// ── Container with fade-in motion ────────────────────────────────────────────

export function OnboardingContainer({
                                        children,
                                        step,
                                        total = 5,
                                    }: {
    children: React.ReactNode;
    step: number;
    total?: number;
}) {
    const insets = useSafeAreaInsets();
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(12);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <View style={[containerStyles.root, { paddingTop: insets.top }]}>
            <OnboardingProgress step={step} total={total} />
            <Animated.View style={[containerStyles.body, animStyle]}>
                {children}
            </Animated.View>
        </View>
    );
}

const containerStyles = StyleSheet.create({
    root: { flex: 1, backgroundColor: BRAND.background },
    body: { flex: 1 },
});

// ── Primary CTA — tactile, warm shadow, inner highlight ──────────────────────

export function PrimaryButton({
                                  label,
                                  onPress,
                                  disabled,
                                  style,
                                  icon,
                              }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    style?: ViewStyle;
    icon?: keyof typeof Feather.glyphMap;
}) {
    const scale = useSharedValue(1);

    const handlePress = () => {
        if (disabled) return;
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
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
                                }: {
    label: string;
    onPress: () => void;
    style?: ViewStyle;
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
            <Text style={buttonStyles.secondaryText}>{label}</Text>
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
});