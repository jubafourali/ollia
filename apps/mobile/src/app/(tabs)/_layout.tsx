import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import { SkyBackground, usePhase } from "@/components/SkyBackground";
import { useFamilyContext } from "@/context/FamilyContext";

export default function TabLayout() {
    const { t } = useTranslation();
    const isWeb = Platform.OS === "web";

    // Shared time-of-day sky behind every tab, driven by the user's region.
    const { myProfile, travelMode, travelDestination } = useFamilyContext();
    const meRegion = travelMode && travelDestination
        ? travelDestination
        : myProfile?.region ?? "";
    const phase = usePhase(meRegion);

    return (
        <View style={{ flex: 1, backgroundColor: BRAND.background }}>
            {/* One sky for the whole app — sits behind the (transparent) tab scenes */}
            <SkyBackground phase={phase} />

            <Tabs
                screenOptions={{
                    tabBarActiveTintColor: BRAND.primary,
                    tabBarInactiveTintColor: BRAND.textMuted,
                    headerShown: false,
                    sceneStyle: { backgroundColor: "transparent" },
                    tabBarStyle: {
                        position: "absolute",
                        backgroundColor: BRAND.background,
                        borderTopWidth: 0,
                        elevation: 0,
                        ...(isWeb ? { height: 84 } : {}),
                    },
                    tabBarBackground: () => (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: BRAND.background }]} />
                    ),
                }}
            >
            <Tabs.Screen
                name="index"
                options={{
                    title: t("tabs.family"),
                    tabBarIcon: ({ color }) => (
                        <Feather name="users" size={22} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="nearby"
                options={{
                    title: "Nearby",
                    tabBarIcon: ({ color }) => (
                        <Feather name="map-pin" size={22} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="my-status"
                options={{
                    title: t("tabs.myStatus"),
                    tabBarIcon: ({ color }) => (
                        <Feather name="heart" size={22} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: t("tabs.settings"),
                    tabBarIcon: ({ color }) => (
                        <Feather name="settings" size={22} color={color} />
                    ),
                }}
            />
            </Tabs>
        </View>
    );
}