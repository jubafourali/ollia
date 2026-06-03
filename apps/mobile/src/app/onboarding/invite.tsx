import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Platform,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import {
    OnboardingContainer,
    PrimaryButton,
    SecondaryButton,
} from "./_components";

const ONBOARDING_PERSON_KEY = "@ollia_onboarding_person";

type StoredPerson = { name: string; relation: string; emoji?: string };

export default function InviteOnboardingScreen() {
    const insets = useSafeAreaInsets();
    const { inviteCode, myProfile } = useFamilyContext();
    const [person, setPerson] = useState<StoredPerson | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_PERSON_KEY);
                if (raw) setPerson(JSON.parse(raw));
            } catch {}
        })();
    }, []);

    const buildLink = (): string => {
        const ownerName = encodeURIComponent(myProfile?.name || "Someone");
        return `https://ollia.app/invite?token=${inviteCode}&name=${ownerName}`;
    };

    const handleInvite = async () => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const name = person?.name || "Someone";
        const link = buildLink();
        try {
            await Share.share({
                message: `Hey, I started using Ollia so we can quietly stay reassured about each other without constant check-ins. Thought of you ❤️\n\nJoin my circle:\n${link}`,
            });
        } catch {}
        // Whether or not the user completed share, proceed forward
        router.push("/onboarding/aha");
    };

    const handleSkip = () => router.push("/onboarding/aha");

    const personName  = person?.name     ?? "your person";
    const personEmoji = person?.emoji    ?? "💛";

    return (
        <OnboardingContainer step={5}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Stay quietly reassured about each other</Text>
                    <Text style={styles.subtitle}>
                        Ollia works best when both people are connected.
                    </Text>
                </View>

                {/* Person card */}
                <View style={styles.card}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {personName[0]?.toUpperCase() ?? "?"}
                        </Text>
                    </View>
                    <View style={styles.cardBody}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name}>{personName}</Text>
                            <Text style={styles.emoji}>{personEmoji}</Text>
                        </View>
                        <Text style={styles.cardStatus}>Added to your Circle</Text>
                    </View>
                    <View style={styles.cardCheck}>
                        <Feather name="check" size={14} color={BRAND.white} />
                    </View>
                </View>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label={`Invite ${personName}`}
                        onPress={handleInvite}
                        icon="share-2"
                    />
                    <SecondaryButton label="I'll do this later" onPress={handleSkip} />
                </View>
            </View>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 24 },
    header: { paddingTop: 16, paddingBottom: 28 },
    title: {
        fontSize: 24,
        fontFamily: "Inter_700Bold",
        color: BRAND.text,
        letterSpacing: -0.4,
        lineHeight: 32,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        lineHeight: 20,
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: BRAND.borderLight,
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
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
    cardBody: { flex: 1 },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 2,
    },
    name: {
        fontSize: 16,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.text,
    },
    emoji: { fontSize: 16 },
    cardStatus: {
        fontSize: 13,
        fontFamily: "Inter_400Regular",
        color: BRAND.statusGreen,
    },
    cardCheck: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: BRAND.statusGreen,
        alignItems: "center",
        justifyContent: "center",
    },
    cta: { paddingTop: 8, gap: 4 },
});