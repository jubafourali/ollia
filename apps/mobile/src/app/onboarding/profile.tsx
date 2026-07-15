import { router } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { AvatarPicker } from "@/components/AvatarPicker";
import { CityPicker } from "@/components/CityPicker";
import { OnboardingContainer, PrimaryButton, StaggeredEnter } from "./_components";
import { ProfileIcon } from "./_illustrations";

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { myProfile, setMyProfile } = useFamilyContext();

    const [name, setName] = useState(myProfile?.name ?? "");
    const [city, setCity] = useState(myProfile?.region ?? "");
    const [timezone, setTimezone] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);

    const canContinue = name.trim().length > 0 && city.trim().length > 0;

    const handleContinue = async () => {
        if (!canContinue || saving) return;
        setSaving(true);
        try {
            await setMyProfile({ name: name.trim(), region: city.trim(), timezone });
        } catch {
            // Non-blocking — they can edit later in Settings.
        }
        router.push("/onboarding/permissions");
    };

    return (
        <OnboardingContainer step={3} onBack={() => router.back()}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <View style={styles.content}>
                    <StaggeredEnter index={0}>
                        <View style={styles.iconWrap}>
                            <ProfileIcon size={56} />
                        </View>
                    </StaggeredEnter>

                    <StaggeredEnter index={1}>
                        <Text style={styles.title}>{t("onboarding.profile.title")}</Text>
                        <Text style={styles.subtitle}>{t("onboarding.profile.subtitle")}</Text>
                    </StaggeredEnter>

                    <StaggeredEnter index={2}>
                        <View style={styles.avatarWrap}>
                            <AvatarPicker name={name || "?"} size={92} />
                            <Text style={styles.avatarCaption}>
                                {t("onboarding.profile.addPhoto")}
                            </Text>
                        </View>
                    </StaggeredEnter>

                    <StaggeredEnter index={3}>
                        <Text style={styles.label}>{t("onboarding.profile.yourName")}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={t("onboarding.profile.namePlaceholder")}
                            placeholderTextColor={BRAND.textMuted}
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                            autoCorrect={false}
                            returnKeyType="next"
                        />

                        <Text style={[styles.label, { marginTop: 18 }]}>
                            {t("onboarding.profile.yourCity")}
                        </Text>
                        <CityPicker
                            value={city}
                            onChange={(displayName, tz) => {
                                setCity(displayName);
                                if (tz) setTimezone(tz);
                            }}
                            placeholder={t("onboarding.profile.cityPlaceholder")}
                        />
                    </StaggeredEnter>

                    <View style={{ flex: 1 }} />

                    <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                        <PrimaryButton
                            label={saving ? t("onboarding.saving") : t("onboarding.continue")}
                            onPress={handleContinue}
                            disabled={!canContinue || saving}
                            icon="arrow-right"
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
    iconWrap: {
        marginBottom: 16,
        alignSelf: "flex-start",
    },
    title: {
        fontSize: 26, fontFamily: "Inter_700Bold", color: BRAND.text,
        letterSpacing: -0.5, marginBottom: 8,
    },
    subtitle: {
        fontSize: 15, fontFamily: "Inter_400Regular", color: BRAND.textSecondary,
        lineHeight: 22, marginBottom: 24,
    },
    avatarWrap: { alignItems: "center", marginBottom: 24, gap: 8 },
    avatarCaption: {
        fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.textSecondary,
    },
    label: {
        fontSize: 13, fontFamily: "Inter_600SemiBold", color: BRAND.textSecondary,
        marginBottom: 8, letterSpacing: 0.2,
    },
    input: {
        backgroundColor: BRAND.backgroundCard,
        borderWidth: 1.5, borderColor: BRAND.borderLight,
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 16, fontFamily: "Inter_500Medium", color: BRAND.text,
    },
    cta: { paddingTop: 8 },
});
