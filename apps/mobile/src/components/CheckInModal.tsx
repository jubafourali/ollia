import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BRAND from "@/constants/colors";
import type { CheckInRequest } from "@/context/FamilyContext";

type Props = {
  request: CheckInRequest | null;
  onRespond: (id: string, response: "fine" | "help") => void;
};

export function CheckInModal({ request, onRespond }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (request) {
      translateY.value = withSpring(0, { damping: 20 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(300, { duration: 250 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [request]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!request) return null;

  return (
    <Modal
      visible={!!request}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.overlay, overlayStyle]} />
        <View style={styles.container}>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 20 },
              sheetStyle,
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.iconContainer}>
              <View style={styles.iconBg}>
                <Ionicons name="heart-outline" size={32} color={BRAND.primary} />
              </View>
            </View>

            <Text style={styles.title}>{t("checkin.title")}</Text>
            <Text style={styles.subtitle}>{t("checkin.subtitle")}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.fineBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  );
                }
                onRespond(request.id, "fine");
              }}
            >
              <Ionicons name="checkmark-circle" size={22} color={BRAND.white} />
              <Text style={styles.fineBtnText}>{t("checkin.fine")}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.helpBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning
                  );
                }
                onRespond(request.id, "help");
              }}
            >
              <Feather name="alert-triangle" size={20} color={BRAND.statusRed} />
              <Text style={styles.helpBtnText}>{t("checkin.help")}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 26, 26, 0.55)",
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: BRAND.backgroundCard,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    alignItems: "center",
    gap: 14,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: BRAND.border,
    borderRadius: 2,
    marginBottom: 8,
  },
  iconContainer: {
    marginBottom: 4,
  },
  iconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${BRAND.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  fineBtn: {
    backgroundColor: BRAND.statusGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
  },
  fineBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white,
  },
  helpBtn: {
    backgroundColor: `${BRAND.statusRed}15`,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    borderWidth: 1.5,
    borderColor: `${BRAND.statusRed}40`,
  },
  helpBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.statusRed,
  },
});
