/**
 * LivingWorldSkia
 *
 * React Native Skia port of FamilyGlobe.tsx.
 * Renders the same warm canvas globe — d3-geo orthographic projection,
 * breathing avatar orbs, constellation lines, rim glow — natively at 60fps.
 *
 * Install deps (one-time):
 *   npx expo install @shopify/react-native-skia d3-geo topojson-client
 *   npx expo prebuild --clean && npx expo run:ios
 *
 * Type stubs if needed:
 *   npm install --save-dev @types/d3-geo @types/topojson-client
 */

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import {
    Canvas,
    Circle,
    Group,
    Paint,
    Path,
    Skia,
    useCanvasRef,
    useTouchHandler,
    BlurMaskFilter,
    RadialGradient,
    vec,
} from "@shopify/react-native-skia";
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
    runOnJS,
} from "react-native-reanimated";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import * as d3geo from "d3-geo";
import * as topojson from "topojson-client";

import BRAND from "@/constants/colors";
import type { FamilyMember } from "@/context/FamilyContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALERT_COLOR    = "#ef4444";
const ALERT_ZONE     = { lat: 48.85, lng: 2.35, radiusDeg: 7.5 };
const INACTIVITY_MS  = 3000;
const VEL_DECAY      = 0.92;
const VEL_ALPHA      = 0.60;
const VEL_THRESHOLD  = 0.015;
const DRAG_SENS      = 0.38;

// ── Per-member config ─────────────────────────────────────────────────────────

const PIN_RGB: Record<string, string> = {
    default_0: "249,115,22",   // first member  → orange
    default_1: "168,85,247",   // second member → purple
    default_2: "16,185,129",   // third member  → green
    default_3: "245,158,11",   // fourth        → amber
};

const BREATH_PERIODS = [9200, 8400, 10800, 7600];
const BREATH_PHASES  = [0, 0.38, 0.71, 0.15];
const PEAK_OPACITIES = [0.34, 0.46, 0.28, 0.38];

// Human-silhouette hint constants per relation
const GLOBE_HINT: Record<string, {
    headY: number; headR: number; headScale: number;
    bodyY: number; bodyXScale: number;
    hAlpha: number; bAlpha: number;
}> = {
    Mom:      { headY:.13, headR:.34, headScale:1.22, bodyY:.46, bodyXScale:1.78, hAlpha:.80, bAlpha:.68 },
    Dad:      { headY:.11, headR:.34, headScale:1.06, bodyY:.48, bodyXScale:1.62, hAlpha:.76, bAlpha:.62 },
    Daughter: { headY:.18, headR:.30, headScale:1.14, bodyY:.50, bodyXScale:1.40, hAlpha:.70, bAlpha:.54 },
    Son:      { headY:.11, headR:.32, headScale:1.08, bodyY:.49, bodyXScale:1.54, hAlpha:.74, bAlpha:.58 },
    Sister:   { headY:.17, headR:.31, headScale:1.14, bodyY:.50, bodyXScale:1.44, hAlpha:.72, bAlpha:.56 },
    Brother:  { headY:.12, headR:.32, headScale:1.10, bodyY:.49, bodyXScale:1.56, hAlpha:.72, bAlpha:.56 },
    Partner:  { headY:.13, headR:.33, headScale:1.16, bodyY:.48, bodyXScale:1.58, hAlpha:.78, bAlpha:.64 },
    Friend:   { headY:.13, headR:.31, headScale:1.12, bodyY:.49, bodyXScale:1.50, hAlpha:.68, bAlpha:.52 },
    default:  { headY:.13, headR:.32, headScale:1.14, bodyY:.49, bodyXScale:1.52, hAlpha:.74, bAlpha:.60 },
};

// ── d3-geo → Skia.Path adapter ────────────────────────────────────────────────
// d3's path generator calls these canvas-like methods on its context object.

function makeSkiaPathContext() {
    let path = Skia.Path.Make();
    return {
        _path: () => path,
        beginPath() { path = Skia.Path.Make(); },
        moveTo(x: number, y: number) { path.moveTo(x, y); },
        lineTo(x: number, y: number) { path.lineTo(x, y); },
        arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) {
            // d3 uses arc for sphere/clip — approximate with addCircle for full circles
            if (Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 1e-6) {
                path.addCircle(x, y, r);
            } else {
                // partial arc — use arcTo approximation
                const sweep = ccw ? -(a1 - a0) : (a1 - a0);
                path.arcToOval(
                    { x: x - r, y: y - r, width: r * 2, height: r * 2 },
                    (a0 * 180) / Math.PI,
                    (sweep * 180) / Math.PI,
                    false,
                );
            }
        },
        bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
            path.cubicTo(x1, y1, x2, y2, x, y);
        },
        quadraticCurveTo(x1: number, y1: number, x: number, y: number) {
            path.quadTo(x1, y1, x, y);
        },
        closePath() { path.close(); },
    };
}

// ── Sun position ──────────────────────────────────────────────────────────────

function getSunPosition(): [number, number] {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = Math.floor((now.getTime() - start) / 86400000);
    const dec = -23.45 * (Math.PI / 180) * Math.cos((2 * Math.PI * (day + 10)) / 365);
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const sLng = (((utcH / 24) * -360 + 180) + 540) % 360 - 180;
    return [sLng, dec * (180 / Math.PI)];
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function rgba(r: number, g: number, b: number, a: number): number {
    return Skia.Color(`rgba(${r},${g},${b},${a})`);
}

function hexToSkia(hex: string, alpha = 1): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return rgba(r, g, b, alpha);
}

function pinRgbToComponents(rgb: string): [number, number, number] {
    const [r, g, b] = rgb.split(",").map(Number);
    return [r, g, b];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PinPos { id: string; x: number; y: number; visible: boolean }

interface NodeConfig {
    id: string;
    name: string;
    relation: string;
    lat: number;
    lng: number;
    pinColor: string;
    pinRgb: string;
    breathPeriod: number;
    breathPhase: number;
    peakOpacity: number;
}

export interface LivingWorldMember {
    id: string;
    name: string;
    relation: string;
    lat: number;    // approximate — from region string
    lng: number;
    pinColor: string;
    status: "OK" | "OVERDUE" | "ALERT";
}

interface Props {
    members: LivingWorldMember[];
    alertMemberId?: string | null;
    onMemberPress?: (id: string) => void;
    selectedId?: string | null;
    size?: number;
}

// ── Main component ────────────────────────────────────────────────────────────

export function LivingWorldSkia({
                                    members,
                                    alertMemberId,
                                    onMemberPress,
                                    selectedId,
                                    size = 330,
                                }: Props) {
    const [worldData, setWorldData] = useState<any>(null);
    const [pins, setPins]           = useState<PinPos[]>([]);

    // Rotation state — mutable refs (not state) for 60fps
    const rot   = useRef<[number, number, number]>([0, 0, 0]);
    const vel   = useRef<[number, number]>([0, 0]);
    const target= useRef<[number, number, number] | null>(null);
    const lastDragEnd = useRef(0);
    const isDragging  = useRef(false);

    // Set initial rotation centered on members
    useEffect(() => {
        if (members.length === 0) return;
        const avgLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
        const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
        rot.current = [-avgLng + 28, -avgLat * 0.55 - 10, 0];
    }, []);

    // Build node configs from members
    const nodes = useMemo<NodeConfig[]>(() =>
            members.map((m, i) => ({
                id: m.id,
                name: m.name,
                relation: m.relation,
                lat: m.lat,
                lng: m.lng,
                pinColor: m.pinColor,
                pinRgb: PIN_RGB[`default_${i}`] ?? PIN_RGB.default_0,
                breathPeriod: BREATH_PERIODS[i % BREATH_PERIODS.length],
                breathPhase:  BREATH_PHASES[i % BREATH_PHASES.length],
                peakOpacity:  PEAK_OPACITIES[i % PEAK_OPACITIES.length],
            })),
        [members]);

    // Focus animation when selectedId changes
    useEffect(() => {
        if (!selectedId) { target.current = null; return; }
        const m = members.find(x => x.id === selectedId);
        if (m) target.current = [-m.lng, -m.lat * 0.55, 0];
    }, [selectedId, members]);

    // Resting rotation
    const restingRot = useMemo<[number, number, number]>(() => {
        if (members.length === 0) return [0, 0, 0];
        const avgLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
        const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
        return [-avgLng, -avgLat * 0.55, 0];
    }, [members]);

    const restingCenter = useMemo<[number, number]>(() => {
        if (members.length === 0) return [0, 0];
        const avgLng = members.reduce((s, m) => s + m.lng, 0) / members.length;
        const avgLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
        return [avgLng, avgLat * 0.55];
    }, [members]);

    const allVisible = useMemo(() =>
            members.every(m =>
                d3geo.geoDistance([m.lng, m.lat], restingCenter) < Math.PI / 2 - 0.08
            ),
        [members, restingCenter]);

    // Fetch world atlas
    useEffect(() => {
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
            .then(r => r.json())
            .then(setWorldData)
            .catch(() => console.warn("Failed to load world atlas"));
    }, []);

    // ── Skia canvas ref + draw loop ───────────────────────────────────────────

    const canvasRef = useCanvasRef();

    useEffect(() => {
        if (!worldData || !canvasRef.current) return;

        const land    = topojson.feature(worldData, (worldData as any).objects.land);
        const sphere  = { type: "Sphere" } as d3geo.GeoPermissibleObjects;
        const cx = size / 2, cy = size / 2;

        const proj = d3geo.geoOrthographic()
            .scale(size / 2 - 2)
            .translate([cx, cy])
            .clipAngle(90);

        let rafId = 0;

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) { rafId = requestAnimationFrame(draw); return; }

            // ── Rotation physics ──────────────────────────────────────────────────
            const r = rot.current;
            if (target.current) {
                const t = target.current;
                r[0] += (t[0] - r[0]) * 0.05;
                r[1] += (t[1] - r[1]) * 0.05;
            } else if (!isDragging.current) {
                const v = vel.current;
                if (Math.abs(v[0]) > VEL_THRESHOLD || Math.abs(v[1]) > VEL_THRESHOLD) {
                    r[0] += v[0]; r[1] = Math.max(-70, Math.min(70, r[1] + v[1]));
                    vel.current = [v[0] * VEL_DECAY, v[1] * VEL_DECAY];
                } else if (Date.now() - lastDragEnd.current >= INACTIVITY_MS && allVisible) {
                    r[0] += (restingRot[0] - r[0]) * 0.04;
                    r[1] += (restingRot[1] - r[1]) * 0.04;
                }
            }
            proj.rotate(r);

            const now_ms    = Date.now();
            const globeBreath = 1 + Math.sin(now_ms / 15000 * Math.PI * 2) * 0.005;
            const lightDrift  = Math.sin(now_ms / 25000 * Math.PI * 2);
            proj.scale((size / 2 - 2) * globeBreath);

            // ── Path context ──────────────────────────────────────────────────────
            const ctx   = makeSkiaPathContext();
            const pathGen = d3geo.geoPath().projection(proj).context(ctx as any);

            const isAlert = !!alertMemberId;

            // ── Clear ──────────────────────────────────────────────────────────────
            canvas.clear(Skia.Color("transparent"));

            // ── Atmosphere halo ────────────────────────────────────────────────────
            {
                const haloClr = isAlert ? [220, 60, 60] : [245, 158, 11];
                const [hr, hg, hb] = haloClr;
                const haloPaint = Skia.Paint();
                haloPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(cx, cy), size / 2 + 72,
                        [
                            rgba(hr, hg, hb, 0.32),
                            rgba(hr, hg, hb, 0.16),
                            rgba(hr, hg, hb, 0.07),
                            rgba(hr, hg, hb, 0.02),
                            rgba(hr, hg, hb, 0),
                        ],
                        [0, 0.25, 0.55, 0.80, 1.0],
                        0, // clamp
                    )
                );
                canvas.drawCircle(cx, cy, size / 2 + 72, haloPaint);
            }

            // ── Ocean ──────────────────────────────────────────────────────────────
            {
                const ox = cx - 48 + lightDrift * 8, oy = cy - 48 + lightDrift * 5;
                ctx.beginPath(); pathGen(sphere);
                const spherePath = ctx._path().copy();
                canvas.save(); canvas.clipPath(spherePath, 0, true);
                const oceanPaint = Skia.Paint();
                oceanPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(ox, oy), size / 2,
                        [
                            Skia.Color("#4a2210"),
                            Skia.Color("#311608"),
                            Skia.Color("#1e0e04"),
                            Skia.Color("#130902"),
                        ],
                        [0, 0.4, 0.8, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(cx, cy, size / 2, oceanPaint);
                canvas.restore();
            }

            // ── Land ───────────────────────────────────────────────────────────────
            {
                const ox = cx - 48 + lightDrift * 8, oy = cy - 48 + lightDrift * 5;
                ctx.beginPath(); pathGen(land as d3geo.GeoPermissibleObjects);
                const landPath = ctx._path().copy();
                const landPaint = Skia.Paint();
                landPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(ox, oy), size / 2,
                        [
                            Skia.Color("#c8a472"),
                            Skia.Color("#b48454"),
                            Skia.Color("#8c5e38"),
                        ],
                        [0, 0.5, 1.0],
                        0,
                    )
                );
                canvas.drawPath(landPath, landPaint);
            }

            // ── Alert zone ─────────────────────────────────────────────────────────
            if (isAlert) {
                try {
                    const zone = d3geo.geoCircle()
                        .center([ALERT_ZONE.lng, ALERT_ZONE.lat])
                        .radius(ALERT_ZONE.radiusDeg)();
                    ctx.beginPath();
                    pathGen(zone as d3geo.GeoPermissibleObjects);
                    const zonePath = ctx._path().copy();
                    const zFill = Skia.Paint();
                    zFill.setColor(rgba(239, 68, 68, 0.28));
                    canvas.drawPath(zonePath, zFill);
                    const zStroke = Skia.Paint();
                    zStroke.setStyle(1); // stroke
                    zStroke.setStrokeWidth(1.2);
                    zStroke.setColor(rgba(239, 68, 68, 0.5));
                    canvas.drawPath(zonePath, zStroke);
                } catch (_) {}
            }

            // ── Land lighting ──────────────────────────────────────────────────────
            {
                const lx = cx - 65 + lightDrift * 12, ly = cy - 65 + lightDrift * 8;
                ctx.beginPath(); pathGen(land as d3geo.GeoPermissibleObjects);
                const litPath = ctx._path().copy();
                const litPaint = Skia.Paint();
                litPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(lx, ly), size / 2,
                        [
                            rgba(255, 225, 155, 0.58),
                            rgba(255, 195, 100, 0.22),
                            rgba(0, 0, 0, 0),
                            rgba(0, 0, 0, 0.28),
                        ],
                        [0, 0.35, 0.65, 1.0],
                        0,
                    )
                );
                canvas.drawPath(litPath, litPaint);
            }

            // ── Night shadow ───────────────────────────────────────────────────────
            try {
                const [solLng, solLat] = getSunPosition();
                const sunPos = proj([solLng, solLat]);
                const sx = sunPos ? cx + (cx - sunPos[0]) * 1.5 : cx;
                const sy = sunPos ? cy + (cy - sunPos[1]) * 1.5 : cy;
                ctx.beginPath(); pathGen(sphere);
                const sphPath = ctx._path().copy();
                canvas.save(); canvas.clipPath(sphPath, 0, true);
                const ngPaint = Skia.Paint();
                ngPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(sx, sy), size * 1.15,
                        [
                            rgba(10, 3, 0, 0.28),
                            rgba(10, 3, 0, 0.09),
                            rgba(10, 3, 0, 0.02),
                            rgba(10, 3, 0, 0),
                        ],
                        [0, 0.42, 0.72, 1.0],
                        0,
                    )
                );
                canvas.drawRect({ x: 0, y: 0, width: size, height: size }, ngPaint);
                canvas.restore();
            } catch (_) {}

            // ── Specular shine ─────────────────────────────────────────────────────
            {
                const lx = cx - 65 + lightDrift * 12, ly = cy - 65 + lightDrift * 8;
                ctx.beginPath(); pathGen(sphere);
                const shinePath = ctx._path().copy();
                const shinePaint = Skia.Paint();
                shinePaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(lx - 20, ly - 20), size * 0.92,
                        [
                            rgba(255, 230, 155, 0.60),
                            rgba(255, 210, 110, 0.30),
                            rgba(255, 180, 70, 0.10),
                            rgba(0, 0, 0, 0),
                        ],
                        [0, 0.22, 0.50, 0.75],
                        0,
                    )
                );
                canvas.drawPath(shinePath, shinePaint);
            }

            // ── Atmosphere veil ────────────────────────────────────────────────────
            {
                ctx.beginPath(); pathGen(sphere);
                const veilPath = ctx._path().copy();
                const veilPaint = Skia.Paint();
                veilPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(cx, cy), size / 2,
                        [
                            rgba(255, 245, 225, 0.04),
                            rgba(255, 238, 210, 0.08),
                            rgba(248, 228, 195, 0.14),
                            rgba(240, 215, 175, 0.27),
                        ],
                        [0, 0.5, 0.8, 1.0],
                        0,
                    )
                );
                canvas.drawPath(veilPath, veilPaint);
            }

            // ── Compute pin positions ──────────────────────────────────────────────
            const center = proj.invert!([cx, cy])!;
            const computedPins = nodes.map(n => {
                const effColor = (n.id === alertMemberId) ? ALERT_COLOR : n.pinColor;
                const effRgb   = (n.id === alertMemberId) ? "239,68,68" : n.pinRgb;
                const pos  = proj([n.lng, n.lat]);
                const dist = d3geo.geoDistance([n.lng, n.lat], center);
                return {
                    ...n,
                    x: pos?.[0] ?? -999,
                    y: pos?.[1] ?? -999,
                    visible: dist < Math.PI / 2 - 0.04,
                    effColor,
                    effRgb,
                };
            });

            // ── Constellation lines ────────────────────────────────────────────────
            const visible = computedPins.filter(p => p.visible);
            for (let i = 0; i < visible.length; i++) {
                for (let j = i + 1; j < visible.length; j++) {
                    const a = visible[i], b = visible[j];
                    const isAL = !!alertMemberId && (a.id === alertMemberId || b.id === alertMemberId);
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2 - 18;

                    // Blurred warm glow thread
                    const blurPaint = Skia.Paint();
                    blurPaint.setStyle(1); // stroke
                    blurPaint.setStrokeWidth(4.5);
                    blurPaint.setColor(isAL ? rgba(239, 68, 68, 0.20) : rgba(255, 218, 140, 0.24));
                    blurPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(0, 2, false));
                    const blurPath = Skia.Path.Make();
                    blurPath.moveTo(a.x, a.y); blurPath.quadTo(mx, my, b.x, b.y);
                    canvas.drawPath(blurPath, blurPaint);

                    // Fine thread
                    const threadPaint = Skia.Paint();
                    threadPaint.setStyle(1);
                    threadPaint.setStrokeWidth(0.8);
                    threadPaint.setColor(isAL ? rgba(239, 68, 68, 0.40) : rgba(255, 228, 160, 0.30));
                    canvas.drawPath(blurPath, threadPaint);
                }
            }

            // ── Avatar nodes ───────────────────────────────────────────────────────
            const R_AV = 22;
            for (const p of computedPins) {
                if (!p.visible) continue;
                const [pr, pg, pb] = pinRgbToComponents(p.effRgb);
                const bPhase = (Math.sin(((now_ms / p.breathPeriod) + p.breathPhase) * Math.PI * 2 - Math.PI / 2) + 1) / 2;

                // Pulse ring timing
                const cyclePos  = (((now_ms / p.breathPeriod) + p.breathPhase) % 1 + 1) % 1;
                const pulseFrac = Math.min(1600 / p.breathPeriod, 0.22);
                const peakStart = 0.20;
                const pulseT    = (cyclePos >= peakStart && cyclePos < peakStart + pulseFrac)
                    ? (cyclePos - peakStart) / pulseFrac : -1;

                // ① Breathing ambient halo
                const haloR   = R_AV + 16 + bPhase * 10;
                const haloAlp = 0.10 + bPhase * (p.peakOpacity - 0.10);
                const haloPaint = Skia.Paint();
                haloPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(p.x, p.y), haloR,
                        [
                            rgba(pr, pg, pb, haloAlp * 0.9),
                            rgba(pr, pg, pb, haloAlp * 0.55),
                            rgba(pr, pg, pb, haloAlp * 0.18),
                            rgba(pr, pg, pb, 0),
                        ],
                        [0, 0.35, 0.65, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(p.x, p.y, haloR, haloPaint);

                // ② Pulse ring
                if (pulseT >= 0) {
                    const pulseR = R_AV + 3 + pulseT * 15;
                    const pulseA = 0.45 * (1 - pulseT);
                    const pPaint = Skia.Paint();
                    pPaint.setShader(
                        Skia.Shader.MakeRadialGradient(
                            vec(p.x, p.y), pulseR + 5,
                            [
                                rgba(pr, pg, pb, 0),
                                rgba(pr, pg, pb, pulseA),
                                rgba(pr, pg, pb, 0),
                            ],
                            [0, (pulseR - 5) / (pulseR + 5), 1.0],
                            0,
                        )
                    );
                    canvas.drawCircle(p.x, p.y, pulseR + 5, pPaint);
                }

                // ③ Status glow ring
                const sRingPaint = Skia.Paint();
                sRingPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(p.x, p.y), R_AV + 7,
                        [
                            rgba(pr, pg, pb, 0),
                            rgba(pr, pg, pb, 0.72),
                            rgba(pr, pg, pb, 0),
                        ],
                        [(R_AV - 1) / (R_AV + 7), 0.4, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(p.x, p.y, R_AV + 7, sRingPaint);

                // ④ Presence token — warm cream orb with human silhouette hint
                canvas.save();
                const clipCircle = Skia.Path.Make();
                clipCircle.addCircle(p.x, p.y, R_AV);
                canvas.clipPath(clipCircle, 0, true);

                // Base gradient
                const basePaint = Skia.Paint();
                basePaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(p.x - R_AV * 0.30, p.y - R_AV * 0.34), R_AV * 1.28,
                        [
                            Skia.Color("#fffcf7"),
                            Skia.Color("#fdf4e8"),
                            Skia.Color("#f0ddc0"),
                            Skia.Color("#d8c09a"),
                            Skia.Color("#bea070"),
                        ],
                        [0, 0.18, 0.46, 0.76, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(p.x, p.y, R_AV, basePaint);

                // Color tint
                const tintPaint = Skia.Paint();
                tintPaint.setColor(hexToSkia(p.effColor, 0.13));
                canvas.drawCircle(p.x, p.y, R_AV, tintPaint);

                // Human head hint
                const hint = GLOBE_HINT[p.relation] ?? GLOBE_HINT.default;
                canvas.save();
                canvas.translate(p.x, p.y - R_AV * hint.headY);
                canvas.scale(1, hint.headScale);
                const headPaint = Skia.Paint();
                headPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(0, 0), R_AV * hint.headR,
                        [
                            rgba(72, 34, 4, hint.hAlpha),
                            rgba(72, 34, 4, hint.hAlpha * 0.55),
                            rgba(72, 34, 4, hint.hAlpha * 0.075),
                            rgba(72, 34, 4, 0),
                        ],
                        [0, 0.38, 0.70, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(0, 0, R_AV * hint.headR, headPaint);
                canvas.restore();

                // Human body hint
                canvas.save();
                canvas.translate(p.x, p.y + R_AV * hint.bodyY);
                canvas.scale(hint.bodyXScale, 0.72);
                const bodyPaint = Skia.Paint();
                bodyPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(0, 0), R_AV * 0.40,
                        [
                            rgba(72, 34, 4, hint.bAlpha),
                            rgba(72, 34, 4, hint.bAlpha * 0.5),
                            rgba(72, 34, 4, 0),
                        ],
                        [0, 0.36, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(0, 0, R_AV * 0.40, bodyPaint);
                canvas.restore();

                // Specular highlight
                const hlPaint = Skia.Paint();
                hlPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(p.x - R_AV * 0.36, p.y - R_AV * 0.42), R_AV,
                        [
                            rgba(255, 255, 255, 0.74),
                            rgba(255, 255, 255, 0.28),
                            rgba(255, 255, 255, 0.07),
                            rgba(255, 255, 255, 0),
                        ],
                        [0, 0.22, 0.48, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(p.x, p.y, R_AV, hlPaint);

                // Rim shadow
                const rimPaint = Skia.Paint();
                rimPaint.setShader(
                    Skia.Shader.MakeRadialGradient(
                        vec(p.x, p.y), R_AV,
                        [rgba(55, 28, 6, 0), rgba(55, 28, 6, 0.38)],
                        [0.62, 1.0],
                        0,
                    )
                );
                canvas.drawCircle(p.x, p.y, R_AV, rimPaint);
                canvas.restore();
            }

            // ── Rim glow rings ─────────────────────────────────────────────────────
            const Rr = size / 2 - 2;
            const rimClr = isAlert ? [239, 68, 68] : [245, 158, 11];
            const [rr, rg, rb] = rimClr;
            for (const ring of [
                { o: 0,  a: 0.58, w: 1.8 },
                { o: 3.5,a: 0.28, w: 4.0 },
                { o: 8,  a: 0.13, w: 5.0 },
                { o: 14, a: 0.05, w: 6.0 },
                { o: 21, a: 0.02, w: 7.0 },
            ]) {
                const rPaint = Skia.Paint();
                rPaint.setStyle(1);
                rPaint.setStrokeWidth(ring.w);
                rPaint.setColor(rgba(rr, rg, rb, ring.a));
                canvas.drawCircle(cx, cy, Rr + ring.o, rPaint);
            }

            // ── Update pins for overlay ────────────────────────────────────────────
            const newPins = computedPins.map(p => ({ id: p.id, x: p.x, y: p.y, visible: p.visible }));
            runOnJS(setPins)(newPins);

            rafId = requestAnimationFrame(draw);
        };

        rafId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafId);
    }, [worldData, nodes, alertMemberId, allVisible, restingRot, size]);

    // ── Gesture handler ────────────────────────────────────────────────────────

    const panGesture = Gesture.Pan()
        .onStart(() => {
            "worklet";
            isDragging.current = true;
            vel.current = [0, 0];
            target.current = null;
        })
        .onUpdate((e) => {
            "worklet";
            const dLng = -e.changeX * DRAG_SENS;
            const dLat  =  e.changeY * DRAG_SENS;
            rot.current[0] += dLng;
            rot.current[1] = Math.max(-70, Math.min(70, rot.current[1] + dLat));
            vel.current = [
                VEL_ALPHA * dLng + (1 - VEL_ALPHA) * vel.current[0],
                VEL_ALPHA * dLat + (1 - VEL_ALPHA) * vel.current[1],
            ];
        })
        .onEnd(() => {
            "worklet";
            isDragging.current = false;
            lastDragEnd.current = Date.now();
        })
        .runOnJS(false);

    // ── Name pill overlay ──────────────────────────────────────────────────────

    const pillOverlay = useMemo(() =>
            pins.filter(p => p.visible).map(p => {
                const m = members.find(x => x.id === p.id);
                if (!m) return null;
                const isSel = selectedId === m.id;
                const pinColor = (m.id === alertMemberId) ? ALERT_COLOR : m.pinColor;
                return (
                    <Pressable
                        key={m.id}
                        onPress={() => onMemberPress?.(m.id)}
                        style={{
                            position: "absolute",
                            left: p.x,
                            top: p.y,
                            transform: [{ translateX: -0.5 }, { translateY: -0.5 }],
                        }}
                    >
                        {/* Stem */}
                        <View style={{
                            position: "absolute",
                            bottom: "100%",
                            left: "50%",
                            marginLeft: -0.75,
                            width: 1.5, height: 6,
                            backgroundColor: pinColor,
                            opacity: 0.65,
                            marginBottom: -1,
                        }} />
                        {/* Pill */}
                        <View style={{
                            position: "absolute",
                            bottom: "100%",
                            left: "50%",
                            transform: [{ translateX: -50 }] as any,
                            marginBottom: 5,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                            paddingHorizontal: 9,
                            paddingVertical: 3,
                            borderRadius: 20,
                            backgroundColor: "rgba(255,251,235,0.95)",
                            borderWidth: 1,
                            borderColor: isSel ? pinColor + "88" : "rgba(255,255,255,0.42)",
                            shadowColor: "#000",
                            shadowOpacity: isSel ? 0.22 : 0.15,
                            shadowRadius: isSel ? 8 : 5,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: 4,
                        }}>
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: pinColor }} />
                            <Text style={{ fontSize: 11, fontWeight: "700", color: "#1A1A1A", letterSpacing: 0.15 }}>
                                {m.name}
                            </Text>
                        </View>
                    </Pressable>
                );
            }),
        [pins, members, selectedId, alertMemberId, onMemberPress]);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <GestureDetector gesture={panGesture}>
            <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
                <Canvas ref={canvasRef} style={{ width: size, height: size }}>
                    {/* Skia draws directly via the imperative ref — no declarative children needed here */}
                </Canvas>
                {/* Name pill overlay — React Native views positioned over canvas */}
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {pillOverlay}
                </View>
            </View>
        </GestureDetector>
    );
}

// ── Lat/lon lookup for FamilyMember regions ───────────────────────────────────
// Drop-in helper: pass a FamilyMember.region string, get approximate coords.

const CITY_COORDS: Record<string, [number, number]> = {
    osaka: [34.6, 135.5], tokyo: [35.7, 139.7], japan: [35.0, 137.0],
    beijing: [39.9, 116.4], shanghai: [31.2, 121.5], seoul: [37.6, 127.0],
    singapore: [1.3, 103.8], jakarta: [-6.2, 106.8], indonesia: [-2.0, 118.0],
    "da nang": [16.1, 108.2], vietnam: [16.5, 107.5],
    mumbai: [19.1, 72.9], delhi: [28.6, 77.2], india: [22.0, 80.0],
    dubai: [25.2, 55.3], "abu dhabi": [24.5, 54.4], uae: [24.5, 54.4],
    nairobi: [-1.3, 36.8], kenya: [-1.0, 37.0], cairo: [30.1, 31.2],
    milan: [45.5, 9.2], italy: [42.8, 12.6], rome: [41.9, 12.5],
    paris: [48.9, 2.3], france: [46.2, 2.2], "saint-julien": [46.1, 6.1],
    lille: [50.6, 3.1], berlin: [52.5, 13.4], germany: [51.2, 10.5],
    london: [51.5, -0.1], madrid: [40.4, -3.7], amsterdam: [52.4, 4.9],
    algiers: [36.7, 3.2], algeria: [28.0, 2.0],
    "new york": [40.7, -74.0], "los angeles": [34.1, -118.2],
    chicago: [41.9, -87.6], toronto: [43.7, -79.4],
    "sao paulo": [-23.5, -46.6], sydney: [-33.9, 151.2],
    "otero county": [32.8, -105.8], "new mexico": [34.3, -106.0],
    "united states": [39.5, -98.4], us: [39.5, -98.4],
};

export function regionToLatLng(region: string): [number, number] | null {
    if (!region) return null;
    const lower = region.toLowerCase();
    const entries = Object.entries(CITY_COORDS).sort((a, b) => b[0].length - a[0].length);
    for (const [key, coords] of entries) {
        if (lower.includes(key)) return coords;
    }
    return null;
}

export function familyMemberToWorldNode(m: FamilyMember, index: number): LivingWorldMember | null {
    const coords = regionToLatLng(m.region);
    if (!coords && !m.isMe) return null;
    const COLORS = ["#f97316", "#a855f7", "#10b981", "#F59E0B", "#3b82f6"];
    return {
        id: m.id,
        name: m.isMe ? "You" : m.name,
        relation: m.relation,
        lat: coords?.[0] ?? 0,
        lng: coords?.[1] ?? 0,
        pinColor: COLORS[index % COLORS.length],
        status: m.pending ? "OVERDUE" : "OK",
    };
}