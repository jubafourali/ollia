import React from "react";
import { StyleSheet, View } from "react-native";

import BRAND from "@/constants/colors";
import i18n from "@/i18n";

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
      return i18n.t("status.active");
    case "recent":
      return i18n.t("status.recent");
    case "away":
      return i18n.t("status.away");
    case "inactive":
      return i18n.t("status.inactive");
    default:
      return i18n.t("status.inactive");
  }
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 2,
    borderColor: BRAND.backgroundCard,
  },
});