import i18n from "@/i18n";

export function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return i18n.t("common.justNow");
  if (diffMins < 60) return i18n.t("common.minutesAgo", { count: diffMins });
  if (diffHours < 24) return i18n.t("common.hoursAgo", { count: diffHours });
  return i18n.t("common.daysAgo", { count: diffDays });
}

export function formatLastSeen(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return i18n.t("common.activeRightNow");
  if (diffMins < 60)
    return i18n.t("common.lastActiveMinutes", { count: diffMins });
  if (diffHours < 24)
    return i18n.t("common.lastActiveHours", { count: diffHours });
  return i18n.t("common.lastActiveDay");
}