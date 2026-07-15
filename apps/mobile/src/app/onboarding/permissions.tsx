import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { requestLocationPermission } from "@/services/backgroundActivity";
import { OnboardingContainer, PrimaryButton, StaggeredEnter } from "./_components";
import {
    LocationGlyph,
    NotificationsGlyph,
    PermissionsIcon,
} from "./_illustrations";

type RowState = "idle" | "granted" | "denied";

function PermissionRow({
    glyph,
    title,
    desc,
    state,
    onEnable,
    enableLabel,
    retryLabel,
}: {
    glyph: React.ReactNode;
    title: string;
    desc: string;
    state: RowState;
    onEnable: () => void;
    enableLabel: string;
    retryLabel: string;
}) {
    return (
        <View style={styles.row}>
            <View style={styles.rowIcon}>{glyph}</View>
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
                    <Text style={styles.enableText}>
                        {state === "denied" ? retryLabel : enableLabel}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

export default function PermissionsScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
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
                <StaggeredEnter index={0}>
                    <View style={styles.iconWrap}>
                        <PermissionsIcon size={56} />
                    </View>
                </StaggeredEnter>

                <StaggeredEnter index={1}>
                    <Text style={styles.title}>{t("onboarding.permissionsStep.title")}</Text>
                    <Text style={styles.subtitle}>{t("onboarding.permissionsStep.subtitle")}</Text>
                </StaggeredEnter>

                <StaggeredEnter index={2}>
                    <PermissionRow
                        glyph={<NotificationsGlyph size={44} />}
                        title={t("onboarding.permissionsStep.notificationsTitle")}
                        desc={t("onboarding.permissionsStep.notificationsDesc")}
                        state={notif}
                        onEnable={enableNotifications}
                        enableLabel={t("onboarding.permissionsStep.enable")}
                        retryLabel={t("onboarding.permissionsStep.retry")}
                    />
                    <PermissionRow
                        glyph={<LocationGlyph size={44} />}
                        title={t("onboarding.permissionsStep.locationTitle")}
                        desc={t("onboarding.permissionsStep.locationDesc")}
                        state={loc}
                        onEnable={enableLocation}
                        enableLabel={t("onboarding.permissionsStep.enable")}
                        retryLabel={t("onboarding.permissionsStep.retry")}
                    />
                </StaggeredEnter>

                <StaggeredEnter index={3}>
                    <Text style={styles.reassure}>{t("onboarding.permissionsStep.reassure")}</Text>
                </StaggeredEnter>

                <View style={{ flex: 1 }} />

                <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label={t("onboarding.continue")}
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
        marginBottom: 16,
        alignSelf: "flex-start",
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
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: BRAND.backgroundCard,
        borderWidth: 1.5, borderColor: BRAND.borderLight,
        borderRadius: 18, padding: 12, marginBottom: 12,
    },
    rowIcon: {
        width: 44, height: 44,
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
