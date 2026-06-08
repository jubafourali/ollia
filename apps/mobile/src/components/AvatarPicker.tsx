import { useUser } from "@clerk/clerk-expo";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useFamilyContext } from "@/context/FamilyContext";
import BRAND from "@/constants/colors";

type Props = {
  /** Name used for the initials fallback when no photo is set. */
  name: string;
  size?: number;
};

/**
 * Tappable avatar that lets the user pick or shoot a profile photo. The image
 * is uploaded to Clerk (which becomes `user.imageUrl`) and then synced to the
 * backend via the family context so the whole circle sees it.
 */
export function AvatarPicker({ name, size = 96 }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const { updateMyAvatar } = useFamilyContext();
  const [uploading, setUploading] = useState(false);

  const imageUrl = user?.hasImage ? user.imageUrl : null;
  const initial = name.trim()[0]?.toUpperCase() ?? "?";

  async function pickAndUpload(source: "library" | "camera") {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("avatar.permTitle"), t("avatar.permBody"));
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      const asset = result.assets?.[0];
      if (result.canceled || !asset?.base64) return;

      setUploading(true);
      const mime = asset.mimeType ?? "image/jpeg";
      const file = `data:${mime};base64,${asset.base64}`;
      await user?.setProfileImage({ file });
      await user?.reload();
      const newUrl = user?.imageUrl;
      if (newUrl) await updateMyAvatar(newUrl);
    } catch (e) {
      console.warn("avatar upload failed:", e);
      Alert.alert(t("avatar.errorTitle"), t("avatar.errorBody"));
    } finally {
      setUploading(false);
    }
  }

  function onPress() {
    if (uploading) return;
    Alert.alert(t("avatar.sheetTitle"), undefined, [
      { text: t("avatar.takePhoto"), onPress: () => pickAndUpload("camera") },
      { text: t("avatar.chooseLibrary"), onPress: () => pickAndUpload("library") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={uploading}
      style={{ width: size, height: size, alignSelf: "center" }}
      accessibilityRole="button"
      accessibilityLabel={t("avatar.sheetTitle")}
    >
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.initial, { fontSize: size * 0.38 }]}>{initial}</Text>
        )}
        {uploading && (
          <View style={[styles.overlay, { borderRadius: size / 2 }]}>
            <ActivityIndicator color={BRAND.white} />
          </View>
        )}
      </View>

      <View style={styles.badge}>
        <Feather name="camera" size={14} color={BRAND.white} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.borderLight,
    overflow: "hidden",
  },
  initial: {
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BRAND.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.background,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 3 },
    }),
  },
});