import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import {
    OnboardingContainer,
    PrimaryButton,
    SecondaryButton,
} from "./_components";

const ONBOARDING_PERSON_KEY   = "@ollia_onboarding_person";
const ONBOARDING_COMPLETE_KEY = "@ollia_onboarding_complete";

type StoredPerson = { name: string; relation: string; emoji?: string };

export default function AhaScreen() {
    const insets = useSafeAreaInsets();
    const [person, setPerson] = useState<StoredPerson | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_PERSON_KEY);
                if (raw) setPerson(JSON.parse(raw));
            } catch {}
        })();
    }, []);

    const finishOnboarding = async () => {
        await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
        router.replace("/(tabs)");
    };

    const goAddAnother = async () => {
        await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
        router.replace("/(tabs)");
    };

    const personName  = person?.name  ?? "Mom";
    const personEmoji = person?.emoji ?? "☕";

    return (
        <OnboardingContainer step={5}>
            <View style={styles.content}>
                <Text style={styles.sectionLabel}>Your Circle</Text>

                {/* Person card */}
                <View style={styles.personCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {personName[0]?.toUpperCase() ?? "?"}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name}>{personName}</Text>
                            <Text style={styles.emoji}>{personEmoji}</Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <View style={styles.statusDot} />
                            <Text style={styles.statusText}>Invitation sent · Waiting to connect</Text>
                        </View>
                    </View>
                </View>

                {/* Warmer section title */}
                <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
                    Here's how Ollia helps
                </Text>

                {/* Example Nearby card */}
                <View style={styles.nearbyCard}>
                    <View style={styles.nearbyHeader}>
                        <View style={styles.nearbyIconWrap}>
                            <Feather name="info" size={14} color={BRAND.statusGreen} />
                        </View>
                        <Text style={styles.nearbyTitle}>Minor weather disruption nearby</Text>
                    </View>
                    <Text style={styles.nearbySentence}>
                        Heavy rainfall has been reported in the Osaka area.
                    </Text>
                    <View style={styles.nearbyFooter}>
                        <View style={styles.trustRow}>
                            <Feather name="shield" size={11} color={BRAND.statusGreen} />
                            <Text style={styles.trustText}>Confirmed by trusted sources</Text>
                        </View>
                        <View style={styles.severityPill}>
                            <View style={styles.severityDot} />
                            <Text style={styles.severityText}>Low concern</Text>
                        </View>
                    </View>
                </View>

                {/* Emotional landing — warmer, less generic */}
                <Text style={styles.helper}>
                    Quiet days feel calmer when you know a little more.
                </Text>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton label="Go to Circle" onPress={finishOnboarding} />
                    <SecondaryButton label="Add another person" onPress={goAddAnother} />
                </View>
            </View>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },

    sectionLabel: {
        fontSize: 13,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.textSecondary,
        letterSpacing: 0.2,
        marginBottom: 10,
    },

    // Person card
    personCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: BRAND.borderLight,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: `${BRAND.primary}20`,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: `${BRAND.primary}40`,
    },
    avatarText: {
        fontSize: 18,
        fontFamily: "Inter_700Bold",
        color: BRAND.primaryDark,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
    },
    name: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: BRAND.text },
    emoji: { fontSize: 16 },
    statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.primary },
    statusText: { fontSize: 12, fontFamily: "Inter_400Regular", color: BRAND.textSecondary },

    // Nearby card
    nearbyCard: {
        backgroundColor: `${BRAND.statusGreen}08`,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${BRAND.statusGreen}40`,
        padding: 14,
        gap: 8,
    },
    nearbyHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    nearbyIconWrap: {
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: `${BRAND.statusGreen}18`,
        alignItems: "center", justifyContent: "center",
    },
    nearbyTitle: {
        fontSize: 13,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.statusGreen,
        flex: 1,
    },
    nearbySentence: {
        fontSize: 13,
        fontFamily: "Inter_400Regular",
        color: "#374151",
        lineHeight: 19,
        paddingLeft: 36,
    },
    nearbyFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: 36,
    },
    trustRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    trustText: { fontSize: 11, fontFamily: "Inter_500Medium", color: BRAND.statusGreen },
    severityPill: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
        backgroundColor: `${BRAND.statusGreen}18`,
        borderWidth: 1, borderColor: `${BRAND.statusGreen}40`,
    },
    severityDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: BRAND.statusGreen },
    severityText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: BRAND.statusGreen },

    helper: {
        fontSize: 14,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        lineHeight: 21,
        marginTop: 18,
        paddingHorizontal: 4,
        fontStyle: "italic",
    },

    cta: { paddingTop: 8, gap: 4 },
});