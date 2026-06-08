import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { CityPicker } from "@/components/CityPicker";
import { OnboardingContainer, PrimaryButton } from "./_components";

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
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
                    <View style={styles.iconWrap}>
                        <Feather name="user" size={22} color={BRAND.primaryDark} />
                    </View>

                    <Text style={styles.title}>First, a little about you</Text>
                    <Text style={styles.subtitle}>
                        Your circle sees your name, and your city helps Ollia know which
                        events are actually near you.
                    </Text>

                    <Text style={styles.label}>Your name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Sarah"
                        placeholderTextColor={BRAND.textMuted}
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        returnKeyType="next"
                    />

                    <Text style={[styles.label, { marginTop: 18 }]}>Your city</Text>
                    <CityPicker
                        value={city}
                        onChange={(displayName, tz) => {
                            setCity(displayName);
                            if (tz) setTimezone(tz);
                        }}
                        placeholder="Search your city"
                    />

                    <View style={{ flex: 1 }} />

                    <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                        <PrimaryButton
                            label={saving ? "Saving…" : "Continue"}
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
        width: 52, height: 52, borderRadius: 16,
        backgroundColor: `${BRAND.primary}1A`,
        borderWidth: 1.5, borderColor: `${BRAND.primary}33`,
        alignItems: "center", justifyContent: "center",
        marginBottom: 20,
    },
    title: {
        fontSize: 26, fontFamily: "Inter_700Bold", color: BRAND.text,
        letterSpacing: -0.5, marginBottom: 8,
    },
    subtitle: {
        fontSize: 15, fontFamily: "Inter_400Regular", color: BRAND.textSecondary,
        lineHeight: 22, marginBottom: 28,
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
