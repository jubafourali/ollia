import { Stack } from "expo-router";
import React from "react";
import BRAND from "@/constants/colors";

export default function OnboardingLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: BRAND.background },
                animation: "fade",
                animationDuration: 400,
                gestureEnabled: false,
            }}
        >
            <Stack.Screen name="hook" />
            <Stack.Screen name="differentiate" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="permissions" />
            <Stack.Screen name="relation" />
            <Stack.Screen name="add-person" />
            <Stack.Screen name="invite" />
            <Stack.Screen name="aha" />
        </Stack>
    );
}
