import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import {
    OnboardingContainer,
    PrimaryButton,
    SecondaryButton,
    StaggeredEnter,
} from "./_components";
import { RelationGlyph, RelationId } from "./_illustrations";

const ONBOARDING_PERSON_KEY = "@ollia_onboarding_person";
const ONBOARDING_INVITE_SHARED_KEY = "@ollia_onboarding_invite_shared";
const ONBOARDING_COMPLETE_KEY = "@ollia_onboarding_complete";
const ONBOARDING_RELATION_KEY = "@ollia_onboarding_relation";

type StoredPerson = { name: string; relation: string; relationId?: RelationId };

export default function AhaScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { userId } = useAuth();
    const [person, setPerson] = useState<StoredPerson | null>(null);
    const [inviteShared, setInviteShared] = useState(false);

    const checkScale = useSharedValue(0);

    const markComplete = () =>
        AsyncStorage.setItem(`${ONBOARDING_COMPLETE_KEY}:${userId}`, "true");

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_PERSON_KEY);
                if (raw) setPerson(JSON.parse(raw));
                const shared = await AsyncStorage.getItem(ONBOARDING_INVITE_SHARED_KEY);
                setInviteShared(shared === "true");
            } catch {}
        })();

        if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        checkScale.value = withDelay(
            200,
            withSpring(1, { damping: 12, stiffness: 180 }),
        );
    }, []);

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
        opacity: checkScale.value,
    }));

    const finishOnboarding = async () => {
        await markComplete();
        router.replace("/(tabs)");
    };

    const goAddAnother = async () => {
        // Stay in onboarding — clear person, go pick another relation
        await AsyncStorage.multiRemove([
            ONBOARDING_PERSON_KEY,
            ONBOARDING_RELATION_KEY,
            ONBOARDING_INVITE_SHARED_KEY,
        ]);
        router.push("/onboarding/relation");
    };

    const personName = person?.name ?? t("onboarding.aha.fallbackName");
    const relationId = person?.relationId ?? "other";
    const statusText = inviteShared
        ? t("onboarding.aha.statusShared", { name: personName })
        : t("onboarding.aha.statusSkipped");

    return (
        <OnboardingContainer step={8}>
            <View style={styles.content}>
                <View style={styles.celebrateRow}>
                    <Animated.View style={[styles.celebrateCheck, checkStyle]}>
                        <Feather name="check" size={26} color={BRAND.white} />
                    </Animated.View>
                </View>

                <StaggeredEnter index={0}>
                    <Text style={styles.sectionLabel}>{t("onboarding.aha.yourCircle")}</Text>
                </StaggeredEnter>

                <Animated.View
                    entering={FadeInDown.delay(150).duration(420).springify().damping(16)}
                    style={styles.personCard}
                >
                    <RelationGlyph id={relationId} size={48} selected />
                    <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name}>{personName}</Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <View
                                style={[
                                    styles.statusDot,
                                    !inviteShared && { backgroundColor: BRAND.textMuted },
                                ]}
                            />
                            <Text style={styles.statusText}>{statusText}</Text>
                        </View>
                    </View>
                </Animated.View>

                <StaggeredEnter index={2}>
                    <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
                        {t("onboarding.aha.howHelps")}
                    </Text>
                </StaggeredEnter>

                <StaggeredEnter index={3}>
                    <View style={styles.nearbyCard}>
                        <View style={styles.nearbyHeader}>
                            <View style={styles.nearbyIconWrap}>
                                <Feather name="info" size={14} color={BRAND.statusGreen} />
                            </View>
                            <Text style={styles.nearbyTitle}>{t("onboarding.aha.demoTitle")}</Text>
                        </View>
                        <Text style={styles.nearbySentence}>
                            {t("onboarding.aha.demoSentence")}
                        </Text>
                        <View style={styles.nearbyFooter}>
                            <View style={styles.trustRow}>
                                <Feather name="shield" size={11} color={BRAND.statusGreen} />
                                <Text style={styles.trustText}>
                                    {t("onboarding.aha.demoTrust")}
                                </Text>
                            </View>
                            <View style={styles.severityPill}>
                                <View style={styles.severityDot} />
                                <Text style={styles.severityText}>
                                    {t("onboarding.aha.demoSeverity")}
                                </Text>
                            </View>
                        </View>
                    </View>
                </StaggeredEnter>

                <StaggeredEnter index={4}>
                    <Text style={styles.helper}>{t("onboarding.aha.helper")}</Text>
                </StaggeredEnter>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label={t("onboarding.aha.goToCircle")}
                        onPress={finishOnboarding}
                        pulse
                    />
                    <SecondaryButton
                        label={t("onboarding.aha.addAnother")}
                        onPress={goAddAnother}
                    />
                </View>
            </View>
        </OnboardingContainer>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },

    celebrateRow: {
        alignItems: "center",
        marginBottom: 16,
    },
    celebrateCheck: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: BRAND.statusGreen,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: BRAND.statusGreen,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },

    sectionLabel: {
        fontSize: 13,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.textSecondary,
        letterSpacing: 0.2,
        marginBottom: 10,
    },

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
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 4,
    },
    name: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: BRAND.text },
    statusBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.primary },
    statusText: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        flexShrink: 1,
    },

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
