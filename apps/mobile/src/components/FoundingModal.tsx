import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import BRAND from "@/constants/colors";
import { useTranslation } from "react-i18next";
import { useAuth } from "@clerk/clerk-expo";
import { useFamilyContext } from "@/context/FamilyContext";
import {api} from "@/utils/api";

const FOUNDING_CLAIMED_KEY = "@ollia_founding_claimed";

export function FoundingModal() {
    const { t } = useTranslation();
    const { userId } = useAuth();
    const { shouldShowFounding, dismissFounding } = useFamilyContext();

    const starScale = useSharedValue(0);
    const starWiggle = useSharedValue(0);
    const contentOpacity = useSharedValue(0);

    useEffect(() => {
        if (!shouldShowFounding) return;
        starScale.value = 0;
        contentOpacity.value = 0;
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
    }, [shouldShowFounding]);

    const starStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: starScale.value },
            { rotate: `${starWiggle.value * 6 - 3}deg` },
        ],
    }));

    const contentStyle = useAnimatedStyle(() => ({
        opacity: contentOpacity.value,
    }));

    function handleClaim() {
        dismissFounding();
        api.claimFounding().catch((e) => {
            console.warn("claimFounding failed:", e);
        });
    }

    return (
        <Modal
            visible={shouldShowFounding}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={handleClaim}
        >
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Reanimated.View style={[styles.starWrap, starStyle]}>
                        <View style={styles.starGlow}>
                            <Text style={styles.starEmoji}>🌟</Text>
                        </View>
                    </Reanimated.View>

                    <Reanimated.View style={[styles.textBlock, contentStyle]}>
                        <Text style={styles.title}>{t("founding.title")}</Text>
                        <Text style={styles.body}>{t("founding.body")}</Text>
                    </Reanimated.View>

                    <Reanimated.View style={[styles.ctaWrap, contentStyle]}>
                        <Pressable
                            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
                            onPress={handleClaim}
                        >
                            <Text style={styles.ctaText}>{t("founding.cta")}</Text>
                        </Pressable>
                    </Reanimated.View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    card: {
        width: "100%",
        maxWidth: 380,
        backgroundColor: BRAND.background,
        borderRadius: 28,
        paddingVertical: 32,
        paddingHorizontal: 28,
        alignItems: "center",
        gap: 22,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.22,
        shadowRadius: 24,
        elevation: 12,
    },
    starWrap: {
        alignItems: "center",
        justifyContent: "center",
    },
    starGlow: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: `${BRAND.primary}18`,
        borderWidth: 1.5,
        borderColor: `${BRAND.primary}35`,
        alignItems: "center",
        justifyContent: "center",
    },
    starEmoji: {
        fontSize: 46,
    },
    textBlock: {
        alignItems: "center",
        gap: 12,
    },
    title: {
        fontSize: 22,
        fontFamily: "Inter_700Bold",
        color: BRAND.text,
        textAlign: "center",
        lineHeight: 28,
    },
    body: {
        fontSize: 15,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        textAlign: "center",
        lineHeight: 22,
    },
    ctaWrap: {
        width: "100%",
        marginTop: 4,
    },
    cta: {
        backgroundColor: BRAND.primary,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
        shadowColor: BRAND.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
        elevation: 3,
    },
    ctaText: {
        fontSize: 15,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.white,
        letterSpacing: 0.2,
    },
});