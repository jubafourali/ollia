/**
 * Maps a member's free-text `region` string to an *approximate, symbolic*
 * position on the abstract world.
 *
 * This is deliberately imprecise. Ollia never communicates an exact location —
 * positions are emotional/geographic suggestions ("somewhere in the Gulf",
 * "around Japan"), never coordinates or pins. Unknown regions get a stable,
 * deterministic scatter so they still feel placed rather than random each render.
 */

export type WorldPosition = { x: number; y: number };

/** Comfortable band inside the sphere so nodes never hug the rim. */
const MIN_X = 0.14;
const MAX_X = 0.86;
const MIN_Y = 0.2;
const MAX_Y = 0.8;

/** Where "you" sits — the warm centre everyone connects to. */
export const SELF_POSITION: WorldPosition = { x: 0.5, y: 0.54 };

/**
 * Keyword → anchor on a loose equirectangular layout (x: west→east, y: north→south,
 * sphere centre ≈ 0.5,0.5). Order matters: more specific keys are matched first.
 */
const REGION_ANCHORS: Array<{ keys: string[]; pos: WorldPosition }> = [
  // East Asia
  { keys: ["japan", "osaka", "tokyo", "kyoto", "korea", "seoul"], pos: { x: 0.8, y: 0.42 } },
  { keys: ["china", "beijing", "shanghai", "hong kong", "taiwan"], pos: { x: 0.74, y: 0.43 } },
  { keys: ["thailand", "singapore", "indonesia", "vietnam", "philippines", "malaysia", "bangkok"], pos: { x: 0.75, y: 0.56 } },
  // South Asia
  { keys: ["india", "pakistan", "bangladesh", "delhi", "mumbai", "sri lanka", "nepal"], pos: { x: 0.67, y: 0.49 } },
  // Middle East / Gulf
  { keys: ["dubai", "uae", "emirates", "qatar", "saudi", "kuwait", "bahrain", "oman", "gulf"], pos: { x: 0.61, y: 0.47 } },
  { keys: ["turkey", "istanbul", "iran", "iraq", "israel", "jordan", "lebanon", "syria"], pos: { x: 0.58, y: 0.43 } },
  // Africa
  { keys: ["egypt", "morocco", "algeria", "tunisia", "cairo"], pos: { x: 0.53, y: 0.5 } },
  { keys: ["nigeria", "kenya", "ghana", "south africa", "ethiopia", "tanzania"], pos: { x: 0.55, y: 0.64 } },
  // Europe
  { keys: ["italy", "milan", "rome", "naples", "venice", "florence"], pos: { x: 0.52, y: 0.4 } },
  { keys: ["spain", "portugal", "madrid", "barcelona", "lisbon"], pos: { x: 0.47, y: 0.42 } },
  { keys: ["france", "paris", "lyon", "marseille"], pos: { x: 0.5, y: 0.37 } },
  { keys: ["germany", "berlin", "munich", "netherlands", "belgium", "switzerland", "austria"], pos: { x: 0.53, y: 0.35 } },
  { keys: ["poland", "czech", "hungary", "romania", "balkan", "serbia", "croatia", "greece", "bosnia"], pos: { x: 0.56, y: 0.38 } },
  { keys: ["sweden", "norway", "denmark", "finland", "iceland", "nordic"], pos: { x: 0.52, y: 0.24 } },
  { keys: ["uk", "united kingdom", "england", "london", "ireland", "scotland", "wales"], pos: { x: 0.47, y: 0.31 } },
  { keys: ["russia", "moscow", "ukraine"], pos: { x: 0.62, y: 0.3 } },
  // Americas
  { keys: ["canada", "toronto", "vancouver", "montreal"], pos: { x: 0.22, y: 0.31 } },
  { keys: ["usa", "united states", "u.s", "america", "new york", "california", "texas", "chicago", "los angeles", "seattle", "boston", "miami"], pos: { x: 0.21, y: 0.41 } },
  { keys: ["mexico", "guatemala", "cuba", "caribbean"], pos: { x: 0.23, y: 0.51 } },
  { keys: ["brazil", "argentina", "chile", "peru", "colombia", "sao paulo", "buenos aires"], pos: { x: 0.31, y: 0.69 } },
  // Oceania
  { keys: ["australia", "sydney", "melbourne", "new zealand", "auckland"], pos: { x: 0.82, y: 0.7 } },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Stable 32-bit-ish hash of a string (deterministic across renders). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function anchorFor(region: string): WorldPosition | null {
  const r = region.toLowerCase();
  for (const { keys, pos } of REGION_ANCHORS) {
    if (keys.some((k) => r.includes(k))) return pos;
  }
  return null;
}

/**
 * Returns a symbolic position for a member.
 * @param region free-text region string (may be empty)
 * @param seed   a stable per-member seed (e.g. member id) used for jitter so two
 *               people in the same place fan out instead of stacking.
 */
export function getRegionPosition(region: string | undefined, seed: string): WorldPosition {
  const trimmed = (region ?? "").trim();
  const base = trimmed ? anchorFor(trimmed) : null;

  // Deterministic small offsets derived from the seed.
  const h = hashString(seed || trimmed || "ollia");
  const angle = (h % 360) * (Math.PI / 180);
  const mag = base ? 0.05 : 0.28; // tight jitter around a known anchor, wide scatter otherwise

  if (base) {
    return {
      x: clamp(base.x + Math.cos(angle) * mag, MIN_X, MAX_X),
      y: clamp(base.y + Math.sin(angle) * mag * 0.7, MIN_Y, MAX_Y),
    };
  }

  // Unknown region: stable scatter on a ring around the centre, biased outward
  // so it doesn't collide with the central "you" node.
  const radius = 0.22 + ((h >> 8) % 100) / 100 * 0.12; // 0.22–0.34
  return {
    x: clamp(SELF_POSITION.x + Math.cos(angle) * radius, MIN_X, MAX_X),
    y: clamp(SELF_POSITION.y + Math.sin(angle) * radius * 0.8, MIN_Y, MAX_Y),
  };
}
