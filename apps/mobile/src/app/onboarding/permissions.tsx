import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { requestLocationPermission } from "@/services/backgroundActivity";
import { OnboardingContainer, PrimaryButton } from "./_components";

type RowState = "idle" | "granted" | "denied";

function PermissionRow({
    icon, title, desc, state, onEnable,
}: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    desc: string;
    state: RowState;
    onEnable: () => void;
}) {
    return (
        <View style={styles.row}>
            <View style={styles.rowIcon}>
                <Feather name={icon} size={20} color={BRAND.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowDesc}>{desc}</Text>
            </View>
            {state === "granted" ? (
                <View style={styles.enabledPill}>
                    <Feather name="check" size={14} color={BRAND.statusGreen} />
                </View>
            ) : (
                <Pressable style={styles.enableBtn} onPress={onEnable}>
                    <Text style={styles.enableText}>{state === "denied" ? "Retry" : "Enable"}</Text>
                </Pressable>
            )}
        </View>
    );
}

export default function PermissionsScreen() {
    const insets = useSafeAreaInsets();
    const [notif, setNotif] = useState<RowState>("idle");
    const [loc, setLoc] = useState<RowState>("idle");

    const enableNotifications = async () => {
        try {
            const { status } = await Notifications.requestPermissionsAsync();
            setNotif(status === "granted" ? "granted" : "denied");
        } catch {
            setNotif("denied");
        }
    };

    const enableLocation = async () => {
        try {
            const ok = await requestLocationPermission();
            setLoc(ok ? "granted" : "denied");
        } catch {
            setLoc("denied");
        }
    };

    return (
        <OnboardingContainer step={4} onBack={() => router.back()}>
            <View style={styles.content}>
                <View style={styles.iconWrap}>
                    <Feather name="shield" size={22} color={BRAND.primaryDark} />
                </View>

                <Text style={styles.title}>Two things keep this gentle</Text>
                <Text style={styles.subtitle}>
                    Ollia works quietly in the background. These let it reassure your
                    circle without anyone having to do anything.
                </Text>

                <PermissionRow
                    icon="bell"
                    title="Notifications"
                    desc="Only when something genuinely matters — never noise."
                    state={notif}
                    onEnable={enableNotifications}
                />
                <PermissionRow
                    icon="map-pin"
                    title="Location"
                    desc="So your circle sees you're okay, automatically."
                    state={loc}
                    onEnable={enableLocation}
                />

                <Text style={styles.reassure}>
                    You're always in control — you can change these anytime in Settings.
                </Text>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label="Continue"
                        onPress={() => router.push("/onboarding/relation")}
                        icon="arrow-right"
                    />
                </View>
            </View>
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
        lineHeight: 22, marginBottom: 24,
    },
    row: {
        flexDirection: "row", alignItems: "center", gap: 14,
        backgroundColor: BRAND.backgroundCard,
        borderWidth: 1.5, borderColor: BRAND.borderLight,
        borderRadius: 16, padding: 16, marginBottom: 12,
    },
    rowIcon: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: `${BRAND.primary}14`,
        alignItems: "center", justifyContent: "center",
    },
    rowTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: BRAND.text, marginBottom: 3 },
    rowDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, lineHeight: 18 },
    enableBtn: {
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
        backgroundColor: BRAND.primary,
    },
    enableText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: BRAND.white },
    enabledPill: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: `${BRAND.statusGreen}1A`,
        borderWidth: 1.5, borderColor: `${BRAND.statusGreen}55`,
        alignItems: "center", justifyContent: "center",
    },
    reassure: {
        fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textMuted,
        lineHeight: 19, marginTop: 8, paddingHorizontal: 4,
    },
    cta: { paddingTop: 8 },
});
