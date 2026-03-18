import React from "react";
import { StyleSheet, Text, View } from "react-native";

import BRAND from "@/constants/colors";
import { StatusDot, getStatusColor } from "./StatusDot";
import { HeartbeatRing } from "./HeartbeatRing";
import type { ActivityStatus } from "./StatusDot";

type Props = {
  name: string;
  avatar: string;
  status: ActivityStatus;
  size?: number;
  showRing?: boolean;
};

export function MemberAvatar({
  name,
  avatar,
  status,
  size = 56,
  showRing = false,
}: Props) {
  const statusColor = getStatusColor(status);
  const isActive = status === "active";

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {showRing && (
        <HeartbeatRing size={size + 16} color={statusColor} active={isActive} />
      )}
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: statusColor,
          },
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.38 }]}>
          {avatar}
        </Text>
      </View>
      <View style={[styles.statusDot, { bottom: 0, right: 0 }]}>
        <StatusDot status={status} size={size * 0.22} />
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
  },
  initial: {
    fontFamily: "Inter_600SemiBold",
    color: BRAND.text,
  },
  statusDot: {
    position: "absolute",
    borderRadius: 99,
  },
});
