import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import i18n, {
    LANGUAGE_STORAGE_KEY,
    LanguageCode,
    SUPPORTED_LANGUAGES,
} from "@/i18n";
import { api } from "@/utils/api";
import {
    BreathingView,
    OnboardingContainer,
    PrimaryButton,
    StaggeredEnter,
} from "./_components";
import { UncertaintyIllustration } from "./_illustrations";

export default function HookScreen() {
    const insets = useSafeAreaInsets();
    const { t, i18n: i18nInstance } = useTranslation();
    const [lang, setLang] = useState<LanguageCode>(
        (i18nInstance.language?.startsWith("fr") ? "fr" : "en") as LanguageCode,
    );

    const switchLanguage = async (code: LanguageCode) => {
        if (code === lang) return;
        setLang(code);
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
        await i18n.changeLanguage(code);
        api.updatePreferredLanguage(code).catch(() => {});
    };

    return (
        <OnboardingContainer step={1}>
            <View style={styles.content}>
                <StaggeredEnter index={0}>
                    <View style={styles.langRow}>
                        {SUPPORTED_LANGUAGES.map((l) => {
                            const active = lang === l.code;
                            return (
                                <Pressable
                                    key={l.code}
                                    onPress={() => switchLanguage(l.code)}
                                    style={[styles.langChip, active && styles.langChipActive]}
                                >
                                    <Text
                                        style={[
                                            styles.langChipText,
                                            active && styles.langChipTextActive,
                                        ]}
                                    >
                                        {l.code.toUpperCase()}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </StaggeredEnter>

                <StaggeredEnter index={1} style={styles.illustration}>
                    <BreathingView>
                        <UncertaintyIllustration size={268} />
                    </BreathingView>
                </StaggeredEnter>

                <StaggeredEnter index={2}>
                    <Text style={styles.headline}>{t("onboarding.hook.headline")}</Text>
                </StaggeredEnter>

                <StaggeredEnter index={3}>
                    <Text style={styles.supporting}>{t("onboarding.hook.body")}</Text>
                </StaggeredEnter>

                <View style={{ flex: 1 }} />

                <StaggeredEnter index={4}>
                    <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                        <PrimaryButton
                            label={t("onboarding.continue")}
                            onPress={() => router.push("/onboarding/differentiate")}
                        />
                    </View>
                </StaggeredEnter>
            </View>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
    langRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        marginBottom: 12,
    },
    langChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: BRAND.borderLight,
        backgroundColor: BRAND.backgroundCard,
    },
    langChipActive: {
        borderColor: `${BRAND.primary}66`,
        backgroundColor: `${BRAND.primary}14`,
    },
    langChipText: {
        fontSize: 12,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.textMuted,
        letterSpacing: 0.5,
    },
    langChipTextActive: { color: BRAND.primaryDark },
    illustration: {
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
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
