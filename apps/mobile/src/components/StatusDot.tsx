import React from "react";
import { StyleSheet, View } from "react-native";

import BRAND from "@/constants/colors";

export type ActivityStatus = "active" | "recent" | "away" | "inactive";

type Props = {
  status: ActivityStatus;
  size?: number;
};

export function StatusDot({ status, size = 12 }: Props) {
  const color = getStatusColor(status);
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export function getStatusColor(status: ActivityStatus): string {
  switch (status) {
    case "active":
      return BRAND.statusGreen;
    case "recent":
      return BRAND.primary;
    case "away":
      return "#F97316";
    case "inactive":
      return "#9CA3AF";
    default:
      return "#9CA3AF";
  }
}

export function getStatusLabel(status: ActivityStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "recent":
      return "Recently active";
    case "away":
      return "Away";
    case "inactive":
      return "No activity";
    default:
      return "Unknown";
  }
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 2,
    borderColor: BRAND.backgroundCard,
  },
});
