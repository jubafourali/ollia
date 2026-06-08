/**
 * Aggregate, circle-level reassurance: the dynamic header line, the small metric,
 * and the rotating reassurance message — all derived from how the circle *feels*
 * as a whole, so the warm copy never contradicts a member who's "worth checking in".
 */
import i18n from "@/i18n";
import type { FamilyMember } from "@/context/FamilyContext";
import type { ApiSafetyEvent } from "@/utils/api";
import { getPresenceState } from "@/utils/presenceState";

export type CircleMood = "calm" | "aware" | "attention";

/** Worst presence across the circle sets the overall mood. */
export function getCircleMood(members: FamilyMember[], events: ApiSafetyEvent[]): CircleMood {
  let mood: CircleMood = "calm";
  for (const m of members) {
    if (m.pending) continue;
    const { level } = getPresenceState(m, events);
    if (level === "worth-checking") return "attention";
    if (level === "worth-knowing") mood = "aware";
  }
  return mood;
}

/** How many of the (non-pending) circle are quietly okay right now. */
export function getQuietlyActive(
  members: FamilyMember[],
  events: ApiSafetyEvent[]
): { count: number; total: number } {
  const real = members.filter((m) => !m.pending);
  const count = real.filter((m) => getPresenceState(m, events).level === "quiet").length;
  return { count, total: real.length };
}

const HEADER_KEY: Record<CircleMood, string> = {
  calm: "family.reassurance.calmHeader",
  aware: "family.reassurance.awareHeader",
  attention: "family.reassurance.attentionHeader",
};

const MESSAGE_KEYS: Record<CircleMood, string[]> = {
  calm: [
    "family.reassurance.calm1",
    "family.reassurance.calm2",
    "family.reassurance.calm3",
    "family.reassurance.calm4",
  ],
  aware: [
    "family.reassurance.aware1",
    "family.reassurance.aware2",
    "family.reassurance.aware3",
  ],
  attention: [
    "family.reassurance.attention1",
    "family.reassurance.attention2",
    "family.reassurance.attention3",
  ],
};

/** Dynamic header secondary line (emotion first). */
export function getHeaderLine(mood: CircleMood): string {
  return i18n.t(HEADER_KEY[mood]) as string;
}

/** Resolved rotating-message pool for the current mood. */
export function getReassuranceMessages(mood: CircleMood): string[] {
  return MESSAGE_KEYS[mood].map((k) => i18n.t(k) as string);
}
