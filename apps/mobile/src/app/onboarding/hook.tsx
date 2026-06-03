import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { OnboardingContainer, PrimaryButton } from "./_components";
import { UncertaintyIllustration } from "./_illustrations";

export default function HookScreen() {
    const insets = useSafeAreaInsets();

    return (
        <OnboardingContainer step={1}>
            <View style={styles.content}>
                {/* Illustration sits closer to top */}
                <View style={styles.illustration}>
                    <UncertaintyIllustration size={240} />
                </View>

                {/* Headline — tight to illustration */}
                <Text style={styles.headline}>Uncertainty turns into worry</Text>

                {/* Body */}
                <Text style={styles.supporting}>
                    When someone you care about lives far away, silence can feel scary. Ollia helps reduce uncertainty — without constant check-ins.
                </Text>

                {/* Flexible spacer pushes CTA down */}
                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                    <PrimaryButton
                        label="Continue"
                        onPress={() => router.push("/onboarding/differentiate")}
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