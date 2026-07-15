import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import BRAND from "@/constants/colors";
import { OnboardingContainer, PrimaryButton, StaggeredEnter } from "./_components";
import { RelationGlyph, RelationId } from "./_illustrations";

const ONBOARDING_RELATION_KEY = "@ollia_onboarding_relation";

const RELATION_IDS: { id: RelationId; fullWidth?: boolean }[] = [
    { id: "mom" },
    { id: "dad" },
    { id: "partner" },
    { id: "child" },
    { id: "sibling" },
    { id: "friend" },
    { id: "other", fullWidth: true },
];

export default function RelationScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const [selected, setSelected] = React.useState<RelationId | null>(null);

    const labelFor = (id: RelationId) => t(`onboarding.relation.${id}`);

    const handleSelect = (id: RelationId) => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelected(id);
    };

    const handleContinue = async () => {
        if (!selected) return;
        await AsyncStorage.setItem(
            ONBOARDING_RELATION_KEY,
            JSON.stringify({
                id: selected,
                label: labelFor(selected),
            }),
        );
        router.push("/onboarding/add-person");
    };

    const grid = RELATION_IDS.filter((r) => !r.fullWidth);
    const fullWidth = RELATION_IDS.filter((r) => r.fullWidth);

    return (
        <OnboardingContainer step={5} onBack={() => router.back()}>
            <View style={styles.content}>
                <StaggeredEnter index={0}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t("onboarding.relation.title")}</Text>
                        <Text style={styles.subtitle}>{t("onboarding.relation.subtitle")}</Text>
                    </View>
                </StaggeredEnter>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.grid}>
                        {grid.map((r, i) => (
                            <RelationCard
                                key={r.id}
                                index={i}
                                id={r.id}
                                label={labelFor(r.id)}
                                selected={selected === r.id}
                                onPress={() => handleSelect(r.id)}
                            />
                        ))}
                    </View>
                    {fullWidth.map((r) => (
                        <RelationCard
                            key={r.id}
                            index={grid.length}
                            id={r.id}
                            label={labelFor(r.id)}
                            selected={selected === r.id}
                            onPress={() => handleSelect(r.id)}
                            fullWidth
                        />
                    ))}
                </ScrollView>

                <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                    <PrimaryButton
                        label={t("onboarding.continue")}
                        onPress={handleContinue}
                        disabled={!selected}
                        pulse={!!selected}
                    />
                </View>
            </View>
        </OnboardingContainer>
    );
}

function RelationCard({
    id,
    label,
    selected,
    onPress,
    fullWidth,
    index,
}: {
    id: RelationId;
    label: string;
    selected: boolean;
    onPress: () => void;
    fullWidth?: boolean;
    index: number;
}) {
    const scale = useSharedValue(1);
    const glow = useSharedValue(0);
    const checkScale = useSharedValue(0);

    useEffect(() => {
        scale.value = withSpring(selected ? 1.03 : 1, { damping: 14, stiffness: 200 });
        glow.value = withTiming(selected ? 1 : 0, { duration: 250, easing: Easing.out(Easing.cubic) });
        checkScale.value = withSpring(selected ? 1 : 0, { damping: 12, stiffness: 220 });
    }, [selected]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glow.value,
    }));

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
        opacity: checkScale.value,
    }));

    return (
        <Animated.View
            entering={FadeInDown.delay(80 + index * 50).duration(380).springify().damping(18)}
            style={[animStyle, fullWidth ? { width: "100%" } : { width: "48%" }]}
        >
            <Pressable
                onPress={onPress}
                onPressIn={() => {
                    scale.value = withTiming(0.97, { duration: 100 });
                }}
                onPressOut={() => {
                    scale.value = withSpring(selected ? 1.03 : 1, { damping: 14, stiffness: 200 });
                }}
                style={[
                    cardStyles.card,
                    fullWidth && cardStyles.fullWidth,
                    selected && cardStyles.cardSelected,
                ]}
            >
                <Animated.View pointerEvents="none" style={[cardStyles.glowOverlay, glowStyle]} />

                <View style={cardStyles.glyphWrap}>
                    <RelationGlyph id={id} size={fullWidth ? 44 : 48} selected={selected} />
                </View>
                <Text style={[cardStyles.label, selected && cardStyles.labelSelected]}>
                    {label}
                </Text>
                <Animated.View style={[cardStyles.check, checkStyle]}>
                    <Feather name="check" size={11} color={BRAND.white} />
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 24 },
    header: { paddingTop: 16, paddingBottom: 20 },
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
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 16 },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 12,
    },
    cta: { paddingTop: 8 },
});

const cardStyles = StyleSheet.create({
    card: {
        minHeight: 128,
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: BRAND.borderLight,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 18,
        paddingHorizontal: 12,
        gap: 10,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
        overflow: "hidden",
    },
    fullWidth: {
        minHeight: 72,
        flexDirection: "row",
        justifyContent: "flex-start",
        paddingHorizontal: 18,
        gap: 14,
    },
    cardSelected: {
        backgroundColor: `${BRAND.primary}10`,
        borderColor: `${BRAND.primary}66`,
        shadowColor: BRAND.primaryDark,
        shadowOpacity: 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    glowOverlay: {
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: `${BRAND.primary}08`,
        borderRadius: 22,
    },
    glyphWrap: {
        alignItems: "center",
        justifyContent: "center",
    },
    label: {
        fontSize: 15,
        fontFamily: "Inter_500Medium",
        color: BRAND.text,
        textAlign: "center",
    },
    labelSelected: {
        fontFamily: "Inter_600SemiBold",
        color: BRAND.primaryDark,
    },
    check: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: BRAND.primary,
        alignItems: "center",
        justifyContent: "center",
    },
});
