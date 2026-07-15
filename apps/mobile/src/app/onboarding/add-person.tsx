import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";

import BRAND from "@/constants/colors";
import { OnboardingContainer, PrimaryButton, StaggeredEnter } from "./_components";
import { RelationGlyph, RelationId } from "./_illustrations";

const ONBOARDING_RELATION_KEY = "@ollia_onboarding_relation";
const ONBOARDING_PERSON_KEY = "@ollia_onboarding_person";

type StoredRelation = { id: RelationId; label: string };

export default function AddPersonScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();

    const [relation, setRelation] = useState<StoredRelation | null>(null);
    const [relationText, setRelationText] = useState("");
    const [nameText, setNameText] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [burst, setBurst] = useState(false);

    const nameRef = useRef<TextInput>(null);
    const checkScale = useSharedValue(0);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_RELATION_KEY);
                if (raw) {
                    const r = JSON.parse(raw) as StoredRelation;
                    setRelation(r);
                    setRelationText(r.label);
                    // Name stays empty — relation is placeholder only
                    setNameText("");
                }
            } catch {}
        })();
    }, []);

    useEffect(() => {
        if (!burst) return;
        checkScale.value = withSequence(
            withSpring(1.15, { damping: 10, stiffness: 220 }),
            withSpring(1, { damping: 14 }),
        );
    }, [burst]);

    const checkStyle = useAnimatedStyle(() => ({
        transform: [{ scale: checkScale.value }],
        opacity: checkScale.value,
    }));

    const handleSubmit = async () => {
        const finalName = nameText.trim();
        const finalRelation =
            relationText.trim() || t("onboarding.addPerson.fallbackRelation");
        if (!finalName) return;

        setSubmitting(true);
        setBurst(true);
        if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        try {
            // Persist only — invite step commits the pending member once
            await AsyncStorage.setItem(
                ONBOARDING_PERSON_KEY,
                JSON.stringify({
                    name: finalName,
                    relation: finalRelation,
                    relationId: relation?.id ?? "other",
                }),
            );
        } catch {}

        // Brief celebration beat before advancing
        await new Promise((r) => setTimeout(r, 420));
        setSubmitting(false);
        router.push("/onboarding/invite");
    };

    const canSubmit = nameText.trim().length > 0 && !submitting;
    const namePlaceholder =
        relation?.id && relation.id !== "other"
            ? relation.label
            : t("onboarding.addPerson.namePlaceholder");

    return (
        <OnboardingContainer step={6} onBack={() => router.back()}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            >
                <View style={styles.content}>
                    <StaggeredEnter index={0}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{t("onboarding.addPerson.title")}</Text>
                            <Text style={styles.subtitle}>
                                {t("onboarding.addPerson.subtitle")}
                            </Text>
                        </View>
                    </StaggeredEnter>

                    <StaggeredEnter index={1} style={styles.form}>
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t("onboarding.addPerson.relation")}</Text>
                            <View style={styles.inputWrap}>
                                {relation?.id ? (
                                    <View style={styles.inputGlyph}>
                                        <RelationGlyph id={relation.id} size={28} />
                                    </View>
                                ) : null}
                                <TextInput
                                    style={[styles.input, relation?.id ? { paddingLeft: 44 } : null]}
                                    value={relationText}
                                    onChangeText={setRelationText}
                                    placeholder={t("onboarding.relation.mom")}
                                    placeholderTextColor={BRAND.textMuted}
                                    returnKeyType="next"
                                    onSubmitEditing={() => nameRef.current?.focus()}
                                />
                            </View>
                        </View>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>{t("onboarding.addPerson.name")}</Text>
                            <View style={styles.inputWrap}>
                                <TextInput
                                    ref={nameRef}
                                    style={styles.input}
                                    value={nameText}
                                    onChangeText={setNameText}
                                    placeholder={namePlaceholder}
                                    placeholderTextColor={BRAND.textMuted}
                                    returnKeyType="done"
                                    autoCapitalize="words"
                                    autoFocus
                                    onSubmitEditing={handleSubmit}
                                />
                            </View>
                        </View>

                        <Text style={styles.hint}>{t("onboarding.addPerson.hint")}</Text>
                    </StaggeredEnter>

                    {burst && (
                        <Animated.View style={[styles.burstCheck, checkStyle]}>
                            <Feather name="check" size={22} color={BRAND.white} />
                        </Animated.View>
                    )}

                    <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                        <PrimaryButton
                            label={t("onboarding.addPerson.cta")}
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            pulse={canSubmit}
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
    header: { paddingBottom: 28 },
    title: {
        fontSize: 24,
        fontFamily: "Inter_700Bold",
        color: BRAND.text,
        letterSpacing: -0.4,
        lineHeight: 32,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 15,
        fontFamily: "Inter_400Regular",
        color: BRAND.textSecondary,
        lineHeight: 22,
    },
    form: { flex: 1, gap: 18 },
    fieldGroup: { gap: 8 },
    label: {
        fontSize: 13,
        fontFamily: "Inter_500Medium",
        color: BRAND.textSecondary,
        paddingLeft: 4,
        letterSpacing: 0.2,
    },
    inputWrap: {
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BRAND.borderLight,
        paddingHorizontal: 16,
        paddingVertical: 4,
        position: "relative",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    inputGlyph: {
        position: "absolute",
        left: 10,
        top: "50%",
        transform: [{ translateY: -14 }],
        zIndex: 1,
    },
    input: {
        fontSize: 16,
        fontFamily: "Inter_500Medium",
        color: BRAND.text,
        paddingVertical: 14,
    },
    hint: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        color: BRAND.textMuted,
        paddingLeft: 4,
        paddingTop: 4,
    },
    burstCheck: {
        position: "absolute",
        alignSelf: "center",
        top: "42%",
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
        zIndex: 10,
    },
    cta: { paddingTop: 8 },
});
