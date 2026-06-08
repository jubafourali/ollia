import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { OnboardingContainer, PrimaryButton } from "./_components";

const ONBOARDING_RELATION_KEY = "@ollia_onboarding_relation";

type Relation = {
    id: string;
    label: string;
    emoji: string;
    fullWidth?: boolean;
};

const RELATIONS: Relation[] = [
    { id: "mom",      label: "Mom",          emoji: "👩" },
    { id: "dad",      label: "Dad",          emoji: "👨" },
    { id: "partner",  label: "Partner",      emoji: "❤️" },
    { id: "child",    label: "Child",        emoji: "👶" },
    { id: "sibling",  label: "Sibling",      emoji: "🧑" },
    { id: "friend",   label: "Friend",       emoji: "👥" },
    { id: "other",    label: "Someone else", emoji: "✨", fullWidth: true },
];

export default function RelationScreen() {
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState<string | null>(null);

    const handleSelect = (id: string) => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelected(id);
    };

    const handleContinue = async () => {
        if (!selected) return;
        const relation = RELATIONS.find((r) => r.id === selected);
        if (relation) {
            await AsyncStorage.setItem(
                ONBOARDING_RELATION_KEY,
                JSON.stringify({ id: relation.id, label: relation.label, emoji: relation.emoji })
            );
        }
        router.push("/onboarding/add-person");
    };

    const grid = RELATIONS.filter((r) => !r.fullWidth);
    const fullWidth = RELATIONS.filter((r) => r.fullWidth);

    return (
        <OnboardingContainer step={5} onBack={() => router.back()}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Who would you want peace of mind about?</Text>
                    <Text style={styles.subtitle}>Start with someone you care about.</Text>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.grid}>
                        {grid.map((r) => (
                            <RelationCard
                                key={r.id}
                                relation={r}
                                selected={selected === r.id}
                                onPress={() => handleSelect(r.id)}
                            />
                        ))}
                    </View>
                    {fullWidth.map((r) => (
                        <RelationCard
                            key={r.id}
                            relation={r}
                            selected={selected === r.id}
                            onPress={() => handleSelect(r.id)}
                            fullWidth
                        />
                    ))}
                </ScrollView>

                <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                    <PrimaryButton
                        label="Continue"
                        onPress={handleContinue}
                        disabled={!selected}
                    />
                </View>
            </View>
        </OnboardingContainer>
    );
}

function RelationCard({
                          relation,
                          selected,
                          onPress,
                          fullWidth,
                      }: {
    relation: Relation;
    selected: boolean;
    onPress: () => void;
    fullWidth?: boolean;
}) {
    const scale = useSharedValue(1);
    const glow  = useSharedValue(0);

    useEffect(() => {
        scale.value = withTiming(selected ? 1 : 1, { duration: 200 });
        glow.value  = withTiming(selected ? 1 : 0, { duration: 250, easing: Easing.out(Easing.cubic) });
    }, [selected]);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        opacity: glow.value,
    }));

    return (
        <Animated.View
            style={[
                animStyle,
                fullWidth ? { width: "100%" } : { width: "48%" },
            ]}
        >
            <Pressable
                onPress={onPress}
                onPressIn={() => { scale.value = withTiming(0.98, { duration: 100 }); }}
                onPressOut={() => { scale.value = withTiming(1, { duration: 180 }); }}
                style={[
                    cardStyles.card,
                    fullWidth && cardStyles.fullWidth,
                    selected && cardStyles.cardSelected,
                ]}
            >
                {/* Warm glow overlay when selected */}
                <Animated.View
                    pointerEvents="none"
                    style={[cardStyles.glowOverlay, glowStyle]}
                />

                <Text style={cardStyles.emoji}>{relation.emoji}</Text>
                <Text style={[cardStyles.label, selected && cardStyles.labelSelected]}>
                    {relation.label}
                </Text>
                {selected && (
                    <View style={cardStyles.check}>
                        <View style={cardStyles.checkInner} />
                    </View>
                )}
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
        aspectRatio: 1.2,
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: BRAND.borderLight,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
        overflow: "hidden",
    },
    fullWidth: {
        aspectRatio: undefined,
        paddingVertical: 20,
        flexDirection: "row",
        gap: 12,
    },
    cardSelected: {
        backgroundColor: `${BRAND.primary}10`,
        borderColor: `${BRAND.primary}66`,
        shadowColor: BRAND.primaryDark,
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    glowOverlay: {
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: `${BRAND.primary}08`,
        borderRadius: 20,
    },
    emoji: { fontSize: 32, marginBottom: 8 },
    label: {
        fontSize: 15,
        fontFamily: "Inter_500Medium",
        color: BRAND.text,
    },
    labelSelected: {
        fontFamily: "Inter_600SemiBold",
        color: BRAND.primaryDark,
    },
    check: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: BRAND.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    checkInner: {
        width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.white,
    },
});