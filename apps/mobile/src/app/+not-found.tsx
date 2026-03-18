import { Feather } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import BRAND from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={styles.container}>
        <Feather name="alert-circle" size={48} color={BRAND.border} />
        <Text style={styles.title}>Page not found</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.background,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  link: {
    marginTop: 8,
  },
  linkText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
});
