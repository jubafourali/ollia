import i18n from "@/i18n";
import BRAND from "@/constants/colors";

export type CheckInTone = "fresh" | "stale" | "never";

export type CheckInLabel = {
  text: string;
  tone: CheckInTone;
  color: string;
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(a: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return isSameLocalDay(a, y);
}

export function getCheckInLabel(lastCheckInAt: Date | null): CheckInLabel {
  if (!lastCheckInAt) {
    return {
      text: i18n.t("checkIn.never"),
      tone: "never",
      color: BRAND.primary,
    };
  }

  const now = new Date();

  if (isSameLocalDay(lastCheckInAt, now)) {
    return {
      text: i18n.t("checkIn.today", { time: formatTime(lastCheckInAt) }),
      tone: "fresh",
      color: BRAND.statusGreen,
    };
  }

  if (isYesterday(lastCheckInAt, now)) {
    return {
      text: i18n.t("checkIn.yesterday", { time: formatTime(lastCheckInAt) }),
      tone: "fresh",
      color: BRAND.statusGreen,
    };
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.max(1, Math.floor((now.getTime() - lastCheckInAt.getTime()) / msPerDay));
  return {
    text: i18n.t("checkIn.daysAgo", { count: diffDays }),
    tone: "stale",
    color: BRAND.primary,
  };
}
