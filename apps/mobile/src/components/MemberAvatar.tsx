import React from "react";
import { StyleSheet, Text, View } from "react-native";

import BRAND from "@/constants/colors";

type Props = {
  name: string;
  avatar: string;
  size?: number;
};

export function MemberAvatar({ name, avatar, size = 56 }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>
          {avatar}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: BRAND.backgroundDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: BRAND.borderLight,
  },
  initial: {
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
});
