import { GlobeMember, ResolvedPin } from "./types";

// ── Status → visual ──────────────────────────────────────────────────────
export const STATUS_PIN_COLOR: Record<string, string> = {
  active:   "#10b981",
  recent:   "#f97316",
  away:     "#a855f7",
  inactive: "#9ca3af",
};

export const STATUS_RING_COLOR: Record<string, string> = {
  active:   "#7ec29a",
  recent:   "#d4956a",
  away:     "#c9883e",
  inactive: "#9ca3af",
};

export const STATUS_LABEL: Record<string, string> = {
  active:   "Active now",
  recent:   "Recently active",
  away:     "Away",
  inactive: "Inactive",
};

// ── Breath animation config per status ───────────────────────────────────
export const STATUS_BREATH: Record<string, { period: number; peak: number }> = {
  active:   { period: 8400,  peak: 0.46 },
  recent:   { period: 9200,  peak: 0.34 },
  away:     { period: 11000, peak: 0.28 },
  inactive: { period: 14000, peak: 0.16 },
};

// ── City → [lat, lng] lookup ──────────────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  // North Africa
  "algiers": [36.74, 3.06], "oran": [35.69, -0.63], "constantine": [36.36, 6.61],
  "tunis": [36.82, 10.17], "sfax": [34.74, 10.76],
  "casablanca": [33.59, -7.62], "rabat": [34.01, -6.83], "marrakech": [31.63, -8.00],
  "cairo": [30.06, 31.25], "alexandria": [31.20, 29.92], "giza": [30.01, 31.21],
  "tripoli": [32.90, 13.18], "khartoum": [15.55, 32.53],
  "addis ababa": [9.03, 38.74], "nairobi": [-1.29, 36.82],
  "dar es salaam": [-6.79, 39.21], "lagos": [6.52, 3.38], "abuja": [9.05, 7.49],
  "accra": [5.56, -0.20], "dakar": [14.69, -17.44], "kinshasa": [-4.32, 15.32],
  "johannesburg": [-26.20, 28.04], "cape town": [-33.92, 18.42],
  "durban": [-29.86, 31.02], "pretoria": [-25.74, 28.19],
  "luanda": [-8.84, 13.23], "maputo": [-25.97, 32.59],
  // Middle East
  "dubai": [25.20, 55.27], "abu dhabi": [24.45, 54.38],
  "sharjah": [25.34, 55.39], "ajman": [25.41, 55.44],
  "riyadh": [24.69, 46.72], "jeddah": [21.54, 39.19], "mecca": [21.39, 39.86],
  "doha": [25.29, 51.53], "kuwait city": [29.37, 47.98],
  "muscat": [23.61, 58.59], "manama": [26.22, 50.59],
  "amman": [31.95, 35.93], "beirut": [33.89, 35.50],
  "damascus": [33.51, 36.29], "baghdad": [33.34, 44.40],
  "tehran": [35.69, 51.42], "mashhad": [36.30, 59.60],
  "tel aviv": [32.08, 34.78], "jerusalem": [31.77, 35.21],
  "ankara": [39.93, 32.86], "istanbul": [41.01, 28.95],
  "izmir": [38.42, 27.14], "sanaa": [15.35, 44.21],
  // Europe
  "paris": [48.85, 2.35], "marseille": [43.30, 5.37], "lyon": [45.75, 4.85],
  "toulouse": [43.60, 1.44], "nice": [43.70, 7.27], "bordeaux": [44.84, -0.58],
  "london": [51.51, -0.13], "manchester": [53.48, -2.24], "birmingham": [52.48, -1.90],
  "glasgow": [55.86, -4.26], "edinburgh": [55.95, -3.19], "liverpool": [53.41, -2.98],
  "berlin": [52.52, 13.40], "hamburg": [53.55, 10.00], "munich": [48.14, 11.58],
  "frankfurt": [50.11, 8.68], "cologne": [50.94, 6.96], "stuttgart": [48.78, 9.18],
  "madrid": [40.42, -3.70], "barcelona": [41.39, 2.15], "valencia": [39.47, -0.38],
  "seville": [37.39, -5.99], "malaga": [36.72, -4.42],
  "rome": [41.90, 12.49], "milan": [45.46, 9.19], "naples": [40.85, 14.27],
  "turin": [45.07, 7.69], "florence": [43.77, 11.26],
  "amsterdam": [52.37, 4.90], "rotterdam": [51.92, 4.48],
  "brussels": [50.85, 4.35], "antwerp": [51.22, 4.40],
  "zurich": [47.38, 8.54], "geneva": [46.20, 6.15], "bern": [46.95, 7.45],
  "vienna": [48.21, 16.37], "graz": [47.07, 15.44], "salzburg": [47.80, 13.04],
  "stockholm": [59.33, 18.07], "gothenburg": [57.71, 11.97],
  "oslo": [59.91, 10.75], "copenhagen": [55.68, 12.57], "helsinki": [60.17, 24.94],
  "warsaw": [52.23, 21.01], "krakow": [50.06, 19.94],
  "prague": [50.08, 14.44], "budapest": [47.50, 19.04],
  "bucharest": [44.43, 26.10], "sofia": [42.70, 23.32],
  "athens": [37.98, 23.73], "thessaloniki": [40.64, 22.94],
  "belgrade": [44.82, 20.46], "zagreb": [45.81, 15.98],
  "lisbon": [38.72, -9.14], "porto": [41.15, -8.61],
  "dublin": [53.33, -6.25], "cork": [51.90, -8.47],
  "moscow": [55.75, 37.62], "saint petersburg": [59.95, 30.32],
  "kyiv": [50.45, 30.52], "kharkiv": [49.99, 36.23],
  "minsk": [53.90, 27.57], "riga": [56.95, 24.11],
  "tallinn": [59.44, 24.75], "vilnius": [54.69, 25.28],
  // Asia Pacific
  "beijing": [39.91, 116.39], "shanghai": [31.23, 121.47],
  "guangzhou": [23.13, 113.26], "shenzhen": [22.54, 114.06],
  "chengdu": [30.57, 104.07], "wuhan": [30.59, 114.30],
  "chongqing": [29.56, 106.55], "tianjin": [39.14, 117.18],
  "nanjing": [32.06, 118.78], "hangzhou": [30.25, 120.15],
  "hong kong": [22.32, 114.17], "taipei": [25.05, 121.53],
  "tokyo": [35.69, 139.69], "yokohama": [35.44, 139.64],
  "osaka": [34.69, 135.50], "nagoya": [35.18, 136.91],
  "sapporo": [43.06, 141.35], "fukuoka": [33.60, 130.40],
  "seoul": [37.57, 126.98], "busan": [35.10, 129.04],
  "singapore": [1.35, 103.82], "kuala lumpur": [3.15, 101.69],
  "jakarta": [-6.21, 106.85], "surabaya": [-7.25, 112.75],
  "manila": [14.60, 120.98], "bangkok": [13.75, 100.52],
  "hanoi": [21.03, 105.84], "ho chi minh city": [10.82, 106.63],
  "phnom penh": [11.55, 104.92], "yangon": [16.87, 96.19],
  "colombo": [6.93, 79.85], "dhaka": [23.72, 90.41],
  "kathmandu": [27.72, 85.32], "karachi": [24.86, 67.01],
  "lahore": [31.56, 74.35], "islamabad": [33.72, 73.04],
  "mumbai": [19.08, 72.88], "delhi": [28.66, 77.23], "new delhi": [28.61, 77.21],
  "bangalore": [12.97, 77.59], "bengaluru": [12.97, 77.59],
  "chennai": [13.08, 80.27], "kolkata": [22.57, 88.36],
  "hyderabad": [17.38, 78.49], "ahmedabad": [23.03, 72.59],
  "pune": [18.52, 73.86], "kabul": [34.53, 69.17],
  "tashkent": [41.30, 69.24], "almaty": [43.25, 76.95],
  // Australia & Pacific
  "sydney": [-33.87, 151.21], "melbourne": [-37.81, 144.96],
  "brisbane": [-27.47, 153.03], "perth": [-31.95, 115.86],
  "adelaide": [-34.93, 138.60], "gold coast": [-28.02, 153.43],
  "auckland": [-36.86, 174.76], "wellington": [-41.29, 174.78],
  "honolulu": [21.31, -157.86],
  // Americas
  "new york": [40.71, -74.01], "los angeles": [34.05, -118.24],
  "chicago": [41.85, -87.65], "houston": [29.76, -95.37],
  "phoenix": [33.45, -112.07], "philadelphia": [39.95, -75.17],
  "san diego": [32.72, -117.16], "dallas": [32.78, -96.80],
  "san jose": [37.34, -121.89], "austin": [30.27, -97.74],
  "seattle": [47.61, -122.33], "denver": [39.74, -104.98],
  "boston": [42.36, -71.06], "nashville": [36.17, -86.78],
  "portland": [45.52, -122.68], "las vegas": [36.17, -115.14],
  "miami": [25.77, -80.19], "atlanta": [33.75, -84.39],
  "toronto": [43.65, -79.38], "montreal": [45.50, -73.57],
  "vancouver": [49.25, -123.12], "calgary": [51.05, -114.07],
  "ottawa": [45.42, -75.70], "edmonton": [53.55, -113.49],
  "mexico city": [19.43, -99.13], "guadalajara": [20.66, -103.35],
  "monterrey": [25.67, -100.31], "havana": [23.13, -82.38],
  "bogota": [4.71, -74.07], "medellin": [6.25, -75.57],
  "lima": [-12.05, -77.04], "quito": [-0.22, -78.51],
  "caracas": [10.49, -66.88], "buenos aires": [-34.61, -58.38],
  "santiago": [-33.46, -70.65], "sao paulo": [-23.55, -46.63],
  "rio de janeiro": [-22.91, -43.17], "brasilia": [-15.78, -47.93],
  "montevideo": [-34.90, -56.19],
  // Country centroids (fallback)
  "algeria": [28.03, 1.66], "france": [46.23, 2.21],
  "uae": [23.42, 53.85], "united arab emirates": [23.42, 53.85],
  "uk": [55.38, -3.44], "united kingdom": [55.38, -3.44],
  "germany": [51.17, 10.45], "spain": [40.46, -3.75], "italy": [41.87, 12.57],
  "usa": [37.09, -95.71], "united states": [37.09, -95.71],
  "canada": [56.13, -106.35], "australia": [-25.27, 133.78],
  "brazil": [-14.24, -51.93], "india": [20.59, 78.96],
  "china": [35.86, 104.20], "japan": [36.20, 138.25],
  "russia": [61.52, 105.32], "turkey": [38.96, 35.24],
  "egypt": [26.82, 30.80], "saudi arabia": [23.89, 45.08],
  "morocco": [31.79, -7.09], "nigeria": [9.08, 8.68],
  "south africa": [-30.56, 22.94], "kenya": [-0.02, 37.91],
  "colombia": [4.57, -74.30], "argentina": [-38.42, -63.62],
  "mexico": [23.63, -102.55], "chile": [-35.68, -71.54],
  "peru": [-9.19, -75.02], "iran": [32.43, 53.69],
  "iraq": [33.22, 43.68], "pakistan": [30.38, 69.35],
  "indonesia": [-0.79, 113.92], "malaysia": [4.21, 101.98],
  "thailand": [15.87, 100.99], "vietnam": [14.06, 108.28],
  "philippines": [12.88, 121.77], "south korea": [35.91, 127.77],
  "new zealand": [-40.90, 174.89],
  "sweden": [60.13, 18.64], "norway": [60.47, 8.47],
  "finland": [61.92, 25.75], "denmark": [56.26, 9.50],
  "netherlands": [52.13, 5.29], "belgium": [50.50, 4.47],
  "switzerland": [46.82, 8.23], "austria": [47.52, 14.55],
  "poland": [51.92, 19.15], "ukraine": [48.38, 31.16],
  "greece": [39.07, 21.82], "portugal": [39.40, -8.22],
  "czech republic": [49.82, 15.47], "hungary": [47.16, 19.50],
};

export function resolveCoords(region: string): [number, number] | null {
  if (!region) return null;
  const parts = region.toLowerCase().split(",").map(s => s.trim());
  for (const part of parts) {
    if (CITY_COORDS[part]) return CITY_COORDS[part];
  }
  const full = region.toLowerCase().trim();
  if (CITY_COORDS[full]) return CITY_COORDS[full];
  for (const key of Object.keys(CITY_COORDS)) {
    if (full.includes(key) || key.includes(full)) return CITY_COORDS[key];
  }
  return null;
}

const PIN_PALETTE = [
  "#f97316", "#a855f7", "#10b981", "#3b82f6",
  "#ec4899", "#eab308", "#14b8a6", "#f43f5e",
];

export function getPinColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PIN_PALETTE[hash % PIN_PALETTE.length];
}

/** Orthographic projection: lat/lng → screen coords on a 2D canvas sphere */
export function projectLatLng(
  lat: number, lng: number,
  rotLng: number, rotLat: number,
  cx: number, cy: number, radius: number,
): { x: number; y: number; visible: boolean } {
  const D2R = Math.PI / 180;
  const phi  = lat  * D2R;
  const lam  = (lng - rotLng) * D2R;
  const phi0 = rotLat * D2R;
  const cosC = Math.sin(phi0) * Math.sin(phi) +
               Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
  if (cosC < 0.04) return { x: 0, y: 0, visible: false };
  const x = radius * Math.cos(phi) * Math.sin(lam);
  const y = radius * (Math.cos(phi0) * Math.sin(phi) -
                      Math.sin(phi0) * Math.cos(phi) * Math.cos(lam));
  return { x: cx + x, y: cy - y, visible: true };
}

export function resolveMembers(members: GlobeMember[], meRegion?: string): ResolvedPin[] {
  const pins: ResolvedPin[] = [];
  for (const m of members) {
    if (m.pending) continue;
    const region = m.region || meRegion || "";
    const coords = resolveCoords(region);
    if (!coords) continue;
    pins.push({
      id: m.id, name: m.name, relation: m.relation, region,
      status: m.status, lastCheckInAt: m.lastCheckInAt, lastSeen: m.lastSeen,
      isMe: m.isMe, lat: coords[0], lng: coords[1],
      pinColor: m.status === "inactive" ? "#9ca3af" : getPinColor(m.id),
      avatarUrl: m.avatarUrl,
    });
  }
  return pins;
}

export function formatLastSeen(date: Date | null): string {
  if (!date || date.getTime() === 0) return "Never checked in";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 2)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return `${days} days ago`;
  return date.toLocaleDateString();
}

/** Compute smart resting rotation (center on the group's average position) */
export function restingRotation(pins: ResolvedPin[]): [number, number] {
  if (!pins.length) return [0, 20];
  const avgLng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;
  const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  return [-avgLng, -avgLat * 0.55];
}
