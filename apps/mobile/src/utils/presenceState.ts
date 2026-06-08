/**
 * Computes a member's *presence state* — the warm, reassuring read on how they
 * seem right now. Driven by check-in freshness AND any safety events near their
 * region, so a calm green can soften to amber ("worth knowing") when there's
 * relevant context nearby. Never panic-coded.
 */
import i18n from "@/i18n";
import BRAND from "@/constants/colors";
import type { FamilyMember } from "@/context/FamilyContext";
import type { ApiSafetyEvent } from "@/utils/api";

export type PresenceLevel = "quiet" | "worth-knowing" | "worth-checking";

export type PresenceState = {
  level: PresenceLevel;
  ringColor: string;
  label: string;
  contextLine: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;

/** Reduce a free-text region to a coarse country token (mirrors FamilyContext). */
export function toCountry(location: string): string {
  const loc = location ?? "";
  return loc.includes(",")
    ? loc.split(",").pop()?.trim().toLowerCase() ?? ""
    : loc.trim().toLowerCase();
}

function isUsToken(c: string): boolean {
  return c === "us" || c === "usa" || c === "u.s" || c.includes("united states") || c === "america";
}

function severityRank(sev: string): number {
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  if (sev === "low") return 1;
  return 0;
}

/** Returns the most significant safety event near a member, or null. */
function dominantNearbyEvent(
  member: FamilyMember,
  events: ApiSafetyEvent[]
): ApiSafetyEvent | null {
  const region = member.travelMode && member.travelDestination ? member.travelDestination : member.region;
  const country = toCountry(region);
  if (!country || country.length < 2) return null;
  const usRelated = isUsToken(country);

  let best: ApiSafetyEvent | null = null;
  for (const e of events) {
    const haystack = `${e.region ?? ""} ${e.title ?? ""}`.toLowerCase();
    const matches = e.source === "NOAA" ? usRelated : haystack.includes(country);
    if (!matches) continue;
    if (!best || severityRank(e.severity) > severityRank(best.severity)) best = e;
  }
  return best;
}

function eventContextKey(type: string): string {
  if (type === "weather") return "family.context.eventWeather";
  if (type === "earthquake") return "family.context.eventEarthquake";
  return "family.context.eventGeneric";
}

/** Whole days since a date (0 = today). */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / DAY_MS);
}

export function getPresenceState(
  member: FamilyMember,
  events: ApiSafetyEvent[]
): PresenceState {
  const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts) as string;

  // Invited-but-not-joined: neutral, never read as "quietly active".
  if (member.pending) {
    return {
      level: "quiet",
      ringColor: BRAND.textMuted,
      label: t("myStatus.pending"),
      contextLine: t("family.context.notYetActive"),
    };
  }

  const event = dominantNearbyEvent(member, events);
  const highEvent = event?.severity === "high";
  const mediumEvent = event?.severity === "medium";

  const checkIn = member.lastCheckInAt;
  const days = checkIn ? daysSince(checkIn) : null;
  const veryStale = days != null && days > 7;
  const never = !checkIn && !member.pending;

  let level: PresenceLevel;
  if (highEvent || never || veryStale) {
    level = "worth-checking";
  } else if (mediumEvent || (days != null && days >= 2)) {
    level = "worth-knowing";
  } else {
    level = "quiet";
  }

  const ringColor =
    level === "quiet"
      ? BRAND.statusGreen
      : level === "worth-knowing"
      ? BRAND.primary
      : BRAND.presenceWarm;

  const label =
    level === "quiet"
      ? t("family.presence.quiet")
      : level === "worth-knowing"
      ? t("family.presence.worthKnowing")
      : t("family.presence.worthChecking");

  // Context line — explain the most relevant reason, gently.
  let contextLine: string;
  if (event && (highEvent || mediumEvent)) {
    contextLine = t(eventContextKey(event.type));
  } else if (member.pending) {
    contextLine = t("family.context.notYetActive");
  } else if (member.travelMode) {
    contextLine = member.travelDestination
      ? t("family.context.traveling", { destination: member.travelDestination })
      : t("family.context.travelingNoDest");
  } else if (days == null) {
    contextLine = t("family.context.quietWhile");
  } else if (days <= 0) {
    contextLine = t("family.context.activeToday");
  } else if (days === 1) {
    contextLine = t("family.context.activeYesterday");
  } else if (days <= 7) {
    contextLine = t("family.context.quietFewDays");
  } else {
    contextLine = t("family.context.quietWhile");
  }

  return { level, ringColor, label, contextLine };
}
