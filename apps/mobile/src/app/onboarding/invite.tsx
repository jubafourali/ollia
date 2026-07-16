import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    Platform,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { trackInviteSent } from "@/utils/analytics";
import {
    OnboardingContainer,
    PrimaryButton,
    SecondaryButton,
    StaggeredEnter,
} from "./_components";
import { RelationGlyph, RelationId } from "./_illustrations";

const ONBOARDING_PERSON_KEY = "@ollia_onboarding_person";
const ONBOARDING_INVITE_SHARED_KEY = "@ollia_onboarding_invite_shared";

type StoredPerson = { name: string; relation: string; relationId?: RelationId };

export default function InviteOnboardingScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { inviteCode, circleId, myProfile, addMember } = useFamilyContext();
    const [person, setPerson] = useState<StoredPerson | null>(null);
    const addedRef = useRef(false);
    const cardScale = useSharedValue(0.92);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_PERSON_KEY);
                if (raw) setPerson(JSON.parse(raw));
            } catch {}
        })();
        cardScale.value = withSpring(1, { damping: 14, stiffness: 160 });
    }, []);

    const cardStyle = useAnimatedStyle(() => ({
        transform: [{ scale: cardScale.value }],
    }));

    const commitMember = () => {
        if (addedRef.current || !person) return;
        addedRef.current = true;
        addMember({
            userId: "",
            name: person.name,
            relation: person.relation,
            avatar: person.name[0]?.toUpperCase() ?? "?",
            avatarUrl: null,
            region: "Invited",
            pending: true,
        });
    };

    const buildLink = (): string => {
        const ownerName = encodeURIComponent(
            myProfile?.name || t("onboarding.inviteStep.someone"),
        );
        return `https://ollia.app/invite?token=${inviteCode}&name=${ownerName}`;
    };

    const advance = async (shared: boolean) => {
        await AsyncStorage.setItem(
            ONBOARDING_INVITE_SHARED_KEY,
            shared ? "true" : "false",
        );
        commitMember();
        router.push("/onboarding/aha");
    };

    const handleInvite = async () => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const link = buildLink();
        try {
            await Share.share({
                message: t("onboarding.inviteStep.shareMessage", { link }),
            });
            if (circleId) await trackInviteSent(circleId);
            await advance(true);
        } catch {
            // User cancelled share sheet — stay on this screen
        }
    };

    const handleSkip = async () => {
        await advance(false);
    };

    const personName = person?.name ?? t("onboarding.inviteStep.yourPerson");
    const relationId = person?.relationId ?? "other";

    return (
        <OnboardingContainer step={7} onBack={() => router.back()}>
            <View style={styles.content}>
                <StaggeredEnter index={0}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t("onboarding.inviteStep.title")}</Text>
                        <Text style={styles.subtitle}>{t("onboarding.inviteStep.subtitle")}</Text>
                    </View>
                </StaggeredEnter>

                <Animated.View
                    entering={FadeInDown.delay(120).duration(450).springify().damping(16)}
                    style={[styles.card, cardStyle]}
                >
                    <RelationGlyph id={relationId} size={48} selected />
                    <View style={styles.cardBody}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name}>{personName}</Text>
                        </View>
                        <Text style={styles.cardStatus}>
                            {t("onboarding.inviteStep.added")}
                        </Text>
                    </View>
                    <View style={styles.cardCheck}>
                        <Feather name="check" size={14} color={BRAND.white} />
                    </View>
                </Animated.View>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label={t("onboarding.inviteStep.cta", { name: personName })}
                        onPress={handleInvite}
                        icon="share-2"
                        pulse
                    />
                    <SecondaryButton
                        label={t("onboarding.inviteStep.skip")}
                        onPress={handleSkip}
                        quiet
                    />
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
        shadowColor: BRAND.primaryDark,
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
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
