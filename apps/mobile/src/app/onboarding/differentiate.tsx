import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import {
    BreathingView,
    OnboardingContainer,
    PrimaryButton,
    StaggeredEnter,
} from "./_components";
import { ReassuranceIllustration } from "./_illustrations";

export default function DifferentiateScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();

    return (
        <OnboardingContainer step={2} onBack={() => router.back()}>
            <View style={styles.content}>
                <StaggeredEnter index={0} style={styles.illustration}>
                    <BreathingView>
                        <ReassuranceIllustration size={268} />
                    </BreathingView>
                </StaggeredEnter>

                <StaggeredEnter index={1}>
                    <Text style={styles.headline}>
                        {t("onboarding.differentiate.headline")}
                    </Text>
                </StaggeredEnter>

                <StaggeredEnter index={2}>
                    <Text style={styles.supporting}>
                        {t("onboarding.differentiate.body")}
                    </Text>
                </StaggeredEnter>

                <View style={{ flex: 1 }} />

                <StaggeredEnter index={3}>
                    <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                        <PrimaryButton
                            label={t("onboarding.continue")}
                            onPress={() => router.push("/onboarding/profile")}
                        />
                    </View>
                </StaggeredEnter>
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
