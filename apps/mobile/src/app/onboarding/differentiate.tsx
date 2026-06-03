import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { OnboardingContainer, PrimaryButton } from "./_components";
import { ReassuranceIllustration } from "./_illustrations";

export default function DifferentiateScreen() {
    const insets = useSafeAreaInsets();

    return (
        <OnboardingContainer step={2}>
            <View style={styles.content}>
                <View style={styles.illustration}>
                    <ReassuranceIllustration size={240} />
                </View>

                <Text style={styles.headline}>
                    Peace of mind without invasive tracking
                </Text>

                <Text style={styles.supporting}>
                    Ollia helps you stay reassured using privacy-first signals and trusted context — not surveillance.
                </Text>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                    <PrimaryButton
                        label="Continue"
                        onPress={() => router.push("/onboarding/relation")}
                    />
                </View>
            </View>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 28, paddingTop: 24 },
    illustration: {
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 40,
    },
    headline: {
        fontSize: 28,
        fontFamily: "Inter_700Bold",
        color: BRAND.text,
        textAlign: "center",
        letterSpacing: -0.5,
        lineHeight: 36,
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    supporting: {
        fontSize: 16,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        textAlign: "center",
        lineHeight: 24,
        paddingHorizontal: 8,
    },
    cta: { paddingTop: 8 },
});