import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import { OnboardingContainer, PrimaryButton } from "./_components";

const ONBOARDING_RELATION_KEY = "@ollia_onboarding_relation";
const ONBOARDING_PERSON_KEY   = "@ollia_onboarding_person";

type StoredRelation = { id: string; label: string; emoji: string };

export default function AddPersonScreen() {
    const insets = useSafeAreaInsets();
    const { addMember } = useFamilyContext();

    const [relation, setRelation] = useState<StoredRelation | null>(null);
    const [relationText, setRelationText] = useState("");
    const [nameText, setNameText]         = useState("");
    const [submitting, setSubmitting]     = useState(false);

    const nameRef = useRef<TextInput>(null);

    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(ONBOARDING_RELATION_KEY);
                if (raw) {
                    const r = JSON.parse(raw) as StoredRelation;
                    setRelation(r);
                    setRelationText(r.label);
                    setNameText(r.id === "other" ? "" : r.label);
                }
            } catch {}
        })();
    }, []);

    const handleSubmit = async () => {
        const finalName     = nameText.trim();
        const finalRelation = relationText.trim() || "Family";
        if (!finalName) return;

        setSubmitting(true);
        try {
            addMember({
                userId: "",
                name: finalName,
                relation: finalRelation,
                avatar: finalName[0]?.toUpperCase() ?? "?",
                region: "Invited",
                pending: true,
            });

            await AsyncStorage.setItem(
                ONBOARDING_PERSON_KEY,
                JSON.stringify({ name: finalName, relation: finalRelation, emoji: relation?.emoji ?? "" })
            );
        } catch {}
        setSubmitting(false);
        router.push("/onboarding/invite");
    };

    const canSubmit = nameText.trim().length > 0 && !submitting;

    return (
        <OnboardingContainer step={4}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            >
                <View style={styles.content}>
                    {/* Emotional context block */}
                    <View style={styles.header}>
                        <Text style={styles.title}>You're starting your circle</Text>
                        <Text style={styles.subtitle}>Add the first person you care about.</Text>
                    </View>

                    <View style={styles.form}>
                        {/* Relation field */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Relation</Text>
                            <View style={styles.inputWrap}>
                                {relation?.emoji ? (
                                    <Text style={styles.inputEmoji}>{relation.emoji}</Text>
                                ) : null}
                                <TextInput
                                    style={[styles.input, relation?.emoji && { paddingLeft: 36 }]}
                                    value={relationText}
                                    onChangeText={setRelationText}
                                    placeholder="Mom"
                                    placeholderTextColor={BRAND.textMuted}
                                    returnKeyType="next"
                                    onSubmitEditing={() => nameRef.current?.focus()}
                                />
                            </View>
                        </View>

                        {/* Name field */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Name</Text>
                            <View style={styles.inputWrap}>
                                <TextInput
                                    ref={nameRef}
                                    style={styles.input}
                                    value={nameText}
                                    onChangeText={setNameText}
                                    placeholder="Mom"
                                    placeholderTextColor={BRAND.textMuted}
                                    returnKeyType="done"
                                    autoCapitalize="words"
                                    onSubmitEditing={handleSubmit}
                                />
                            </View>
                        </View>

                        <Text style={styles.hint}>You can always change this later.</Text>
                    </View>

                    <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
                        <PrimaryButton
                            label="Add to Circle"
                            onPress={handleSubmit}
                            disabled={!canSubmit}
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
    // Tactile input with subtle elevation
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
    inputEmoji: {
        position: "absolute",
        left: 14,
        top: "50%",
        transform: [{ translateY: -11 }],
        fontSize: 16,
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
    cta: { paddingTop: 8 },
});