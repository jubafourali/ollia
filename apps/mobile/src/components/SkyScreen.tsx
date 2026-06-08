/**
 * Layout helpers for putting a screen's content on a cream "sheet" that rises
 * over the shared time-of-day sky, with the screen title sitting on the sky
 * itself (white text). Keeps every content screen readable on any sky phase.
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BRAND from "@/constants/colors";

export function SkyHeader({ title, subtitle, right }: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
        </View>
    );
}

/** Opaque cream sheet with a rounded top — content sits here, always readable. */
export const sheetStyle: ViewStyle = {
    flex: 1,
    backgroundColor: BRAND.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
};

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 22,
        paddingBottom: 16,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    title: {
        fontSize: 28,
        fontFamily: "Inter_700Bold",
        color: "#ffffff",
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        fontFamily: "Inter_500Medium",
        color: "rgba(255,255,255,0.82)",
        marginTop: 3,
    },
});