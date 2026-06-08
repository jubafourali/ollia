/**
 * DESTINATION: apps/mobile/src/components/FamilyGlobe/index.tsx
 * Replace the existing index.tsx in your FamilyGlobe component folder.
 */
/**
 * FamilyGlobe/index.tsx
 *
 * Rewrite: SVG-based orthographic globe matching the mockup design.
 *   • Warm amber/brown Earth (land + ocean rendered via SVG paths)
 *   • Name pills with colored dot + stem floating above each pin
 *   • Presence tokens drawn as SVG circles with frosted human hints
 *   • Breathing halo per pin, pulsing rings
 *   • Constellation lines between visible members
 *   • Caption text below globe ("Quiet evening nearby 🌙")
 *   • Circular globe, transparent background matching app
 *   • Tour mode: eases to resting angle that centers all members
 *   • Tap a pin → slide-up detail panel
 *   • Web guard: expo-gl free, pure SVG works everywhere
 *
 * Drop-in replacement for components/FamilyGlobe/index.tsx
 */

import React, {
    useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
    Animated, Easing, LayoutChangeEvent, Platform,
    Pressable, StyleSheet, Text, View,
} from "react-native";
import Svg, {
    Circle, Defs, RadialGradient, Stop, Path,
    G, Line, ClipPath, Rect,
} from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import BRAND from "@/constants/colors";
import {
    ResolvedPin, GlobeMember,
} from "./types";
import {
    resolveMembers, formatLastSeen, STATUS_LABEL,
    STATUS_PIN_COLOR, restingRotation,
} from "./globeUtils";

// ── Constants ──────────────────────────────────────────────────────────────
const GLOBE_H         = 260;
const PANEL_H         = 220;
const AUTO_ROT_SPD    = 0.28;   // degrees/frame
const INERTIA_DECAY   = 0.88;
const INERTIA_THRESH  = 0.08;
const DRAG_MS_RESUME  = 2000;
const R_AV            = 18;     // presence token radius (px in SVG coords)
const D2R             = Math.PI / 180;

// ── Types ──────────────────────────────────────────────────────────────────
type ScreenPin = {
    id: string; name: string; relation: string; region: string;
    status: ResolvedPin["status"];
    lastCheckInAt: Date | null; lastSeen: Date; isMe?: boolean;
    pinColor: string;
    x: number; y: number; visible: boolean;
};

// ── Orthographic projection helpers ────────────────────────────────────────
function projectLatLng(
    lat: number, lng: number,
    rotLng: number, rotLat: number,
    cx: number, cy: number, radius: number,
): { x: number; y: number; visible: boolean } {
    const phi   = lat  * D2R;
    const lam   = (lng - rotLng) * D2R;
    const phi0  = rotLat * D2R;
    const cosC  = Math.sin(phi0) * Math.sin(phi)
        + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
    if (cosC < 0.04) return { x: 0, y: 0, visible: false };
    const x = radius * Math.cos(phi) * Math.sin(lam);
    const y = radius * (Math.cos(phi0) * Math.sin(phi)
        - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam));
    return { x: cx + x, y: cy - y, visible: true };
}

/** Great-circle arc between two lat/lng points as SVG polyline points */
function arcPath(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
    rotLng: number, rotLat: number,
    cx: number, cy: number, radius: number,
    steps = 16,
): string {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = lat1 + (lat2 - lat1) * t;
        const lng = lng1 + (lng2 - lng1) * t;
        const p = projectLatLng(lat, lng, rotLng, rotLat, cx, cy, radius);
        if (p.visible) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        else if (pts.length) break;
    }
    if (pts.length < 2) return "";
    return "M " + pts.join(" L ");
}

// ── Simplified land outlines (major continents, SVG-path friendly) ─────────
// We fetch world-atlas topojson from CDN and convert to simplified SVG paths
// using the orthographic projection at render time.
// For the initial frame (before fetch), we draw graticule lines only.

type LandFeature = { type: "polygon" | "multipolygon"; rings: [number, number][][] };

/** Convert topojson arc index list to [lng,lat][] using topojson delta-decode */
function decodeTopo(topo: any): LandFeature[] {
    const arcs: [number, number][][] = topo.arcs.map((arc: number[][]) => {
        let x = 0, y = 0;
        return arc.map(([dx, dy]: number[]) => {
            x += dx; y += dy;
            const lng = x * topo.transform.scale[0] + topo.transform.translate[0];
            const lat = y * topo.transform.scale[1] + topo.transform.translate[1];
            return [lng, lat] as [number, number];
        });
    });

    const resolveArc = (idx: number): [number, number][] =>
        idx < 0 ? [...arcs[~idx]].reverse() : arcs[idx];

    const resolveRing = (indices: number[]): [number, number][] =>
        indices.flatMap(resolveArc);

    const features: LandFeature[] = [];
    const land = topo.objects?.land;
    if (!land) return features;

    const geoms = land.geometries ?? [];
    for (const geom of geoms) {
        if (geom.type === "Polygon") {
            features.push({ type: "polygon", rings: geom.arcs.map(resolveRing) });
        } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.arcs) {
                features.push({ type: "polygon", rings: poly.map(resolveRing) });
            }
        }
    }
    return features;
}

/** Project a land ring to an SVG path string (clip to visible hemisphere) */
function ringToPath(
    ring: [number, number][],
    rotLng: number, rotLat: number,
    cx: number, cy: number, radius: number,
): string {
    const pts: string[] = [];
    let prevVisible = false;
    for (const [lng, lat] of ring) {
        const p = projectLatLng(lat, lng, rotLng, rotLat, cx, cy, radius);
        if (p.visible) {
            if (!prevVisible && pts.length) pts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
            else if (!prevVisible) pts.push(`M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
            else pts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
            prevVisible = true;
        } else {
            prevVisible = false;
        }
    }
    if (pts.length < 2) return "";
    return pts.join(" ") + " Z";
}

// ── Latitude/longitude grid ────────────────────────────────────────────────
function buildGraticule(
    rotLng: number, rotLat: number,
    cx: number, cy: number, radius: number,
): string[] {
    const paths: string[] = [];
    // Latitude lines every 30°
    for (let lat = -60; lat <= 60; lat += 30) {
        const pts: string[] = [];
        for (let lng = -180; lng <= 180; lng += 6) {
            const p = projectLatLng(lat, lng, rotLng, rotLat, cx, cy, radius);
            if (p.visible) {
                pts.push(pts.length === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
            }
        }
        if (pts.length > 1) paths.push(pts.join(" "));
    }
    // Longitude lines every 30°
    for (let lng = -180; lng < 180; lng += 30) {
        const pts: string[] = [];
        for (let lat = -90; lat <= 90; lat += 6) {
            const p = projectLatLng(lat, lng, rotLng, rotLat, cx, cy, radius);
            if (p.visible) {
                pts.push(pts.length === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
            }
        }
        if (pts.length > 1) paths.push(pts.join(" "));
    }
    return paths;
}

// ── Presence token (SVG) ───────────────────────────────────────────────────
// Inline the warm-cream orb with relation-based human hint

type HintPreset = {
    headY: number; headR: number; headScaleY: number;
    bodyY: number; bodyScaleX: number;
    hOp: [number, number, number];
    bOp: [number, number, number];
};

const HINT: Record<string, HintPreset> = {
    Mom:      { headY:0.13, headR:0.34, headScaleY:1.22, bodyY:0.46, bodyScaleX:1.78, hOp:[0.80,0.44,0.06], bOp:[0.68,0.34,0.00] },
    Dad:      { headY:0.11, headR:0.34, headScaleY:1.06, bodyY:0.48, bodyScaleX:1.62, hOp:[0.76,0.40,0.06], bOp:[0.62,0.30,0.00] },
    Daughter: { headY:0.18, headR:0.30, headScaleY:1.14, bodyY:0.50, bodyScaleX:1.40, hOp:[0.70,0.36,0.05], bOp:[0.54,0.24,0.00] },
    Son:      { headY:0.11, headR:0.32, headScaleY:1.08, bodyY:0.49, bodyScaleX:1.54, hOp:[0.74,0.38,0.06], bOp:[0.58,0.26,0.00] },
    Sister:   { headY:0.17, headR:0.31, headScaleY:1.14, bodyY:0.50, bodyScaleX:1.44, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
    Brother:  { headY:0.12, headR:0.32, headScaleY:1.10, bodyY:0.49, bodyScaleX:1.56, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
    Grandma:  { headY:0.12, headR:0.33, headScaleY:1.20, bodyY:0.45, bodyScaleX:1.82, hOp:[0.74,0.40,0.06], bOp:[0.60,0.30,0.00] },
    Grandpa:  { headY:0.11, headR:0.33, headScaleY:1.08, bodyY:0.47, bodyScaleX:1.64, hOp:[0.72,0.38,0.06], bOp:[0.58,0.28,0.00] },
    Partner:  { headY:0.13, headR:0.33, headScaleY:1.16, bodyY:0.48, bodyScaleX:1.58, hOp:[0.78,0.42,0.06], bOp:[0.64,0.32,0.00] },
    Aunt:     { headY:0.15, headR:0.32, headScaleY:1.18, bodyY:0.47, bodyScaleX:1.62, hOp:[0.74,0.38,0.05], bOp:[0.58,0.28,0.00] },
    Uncle:    { headY:0.11, headR:0.33, headScaleY:1.08, bodyY:0.49, bodyScaleX:1.58, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
    Friend:   { headY:0.13, headR:0.31, headScaleY:1.12, bodyY:0.49, bodyScaleX:1.50, hOp:[0.68,0.34,0.05], bOp:[0.52,0.24,0.00] },
    default:  { headY:0.13, headR:0.32, headScaleY:1.14, bodyY:0.49, bodyScaleX:1.52, hOp:[0.74,0.40,0.06], bOp:[0.60,0.30,0.00] },
};

function PresenceTokenSVG({
                              cx, cy, r, pinColor, relation, uid,
                          }: { cx: number; cy: number; r: number; pinColor: string; relation: string; uid: string }) {
    const h = HINT[relation] ?? HINT.default;
    const headCy = cy - r * h.headY;
    const headRx = r * h.headR;
    const headRy = r * h.headR * h.headScaleY;
    const bodyCy = cy + r * h.bodyY;
    const bodyRx = r * 0.40 * h.bodyScaleX;
    const bodyRy = r * 0.40 * 0.72;

    return (
        <G>
            {/* Base cream orb */}
            <Circle cx={cx} cy={cy} r={r} fill={`url(#ptBase_${uid})`} clipPath={`url(#ptClip_${uid})`} />
            {/* Pin color tint */}
            <Circle cx={cx} cy={cy} r={r} fill={pinColor} fillOpacity={0.13} clipPath={`url(#ptClip_${uid})`} />
            {/* Head silhouette */}
            <G transform={`translate(${cx}, ${headCy}) scale(1, ${h.headScaleY})`}>
                <Circle cx={0} cy={0} r={headRx} fill={`url(#ptHead_${uid})`} clipPath={`url(#ptClip_${uid})`} />
            </G>
            {/* Shoulder silhouette */}
            <G transform={`translate(${cx}, ${bodyCy}) scale(${h.bodyScaleX}, 0.72)`}>
                <Circle cx={0} cy={0} r={r * 0.40} fill={`url(#ptBody_${uid})`} clipPath={`url(#ptClip_${uid})`} />
            </G>
            {/* Highlight */}
            <Circle cx={cx} cy={cy} r={r} fill={`url(#ptHL_${uid})`} clipPath={`url(#ptClip_${uid})`} />
            {/* Rim vignette */}
            <Circle cx={cx} cy={cy} r={r} fill={`url(#ptRim_${uid})`} clipPath={`url(#ptClip_${uid})`} />
        </G>
    );
}

// ── Props ──────────────────────────────────────────────────────────────────
type Props = {
    members: GlobeMember[];
    meRegion?: string;
};

// ── Component ──────────────────────────────────────────────────────────────
export function FamilyGlobe({ members, meRegion }: Props) {
    const [containerW, setContainerW] = useState(320);
    const [pins, setPins]             = useState<ScreenPin[]>([]);
    const [selected, setSelected]     = useState<ScreenPin | null>(null);
    const [panelAnim]                 = useState(() => new Animated.Value(0));
    const [landFeatures, setLandFeatures] = useState<LandFeature[]>([]);
    const [tick, setTick]             = useState(0); // drives SVG re-render

    // Rotation state (degrees) — kept in ref, pushed to state via tick
    const rotRef        = useRef({ y: 0, x: 20 });
    const velRef        = useRef({ y: 0, x: 0 });
    const isDragging    = useRef(false);
    const lastTouch     = useRef<{ x: number; y: number } | null>(null);
    const lastDragEnd   = useRef(0);
    const restingRot    = useRef<[number, number]>([0, 20]);
    const rafRef        = useRef<number>(0);
    const resolvedPins  = useRef<ResolvedPin[]>([]);
    const breathRef     = useRef<Record<string, number>>({}); // 0..1 per pin

    // Fetch world atlas for land shapes
    useEffect(() => {
        fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
            .then(r => r.json())
            .then(data => setLandFeatures(decodeTopo(data)))
            .catch(() => {}); // silently continue with graticule-only if offline
    }, []);

    // Resolve members → pins
    useEffect(() => {
        const resolved = resolveMembers(members, meRegion);
        resolvedPins.current = resolved;
        const [lng, lat] = restingRotation(resolved);
        restingRot.current = [lng, lat];
    }, [members, meRegion]);

    // Animation loop
    useEffect(() => {
        let frame = 0;
        const loop = () => {
            frame = requestAnimationFrame(loop);
            rafRef.current = frame;

            const rot   = rotRef.current;
            const vel   = velRef.current;
            const rest  = restingRot.current;

            if (!isDragging.current) {
                const sinceEnd   = Date.now() - lastDragEnd.current;
                const hasInertia = Math.abs(vel.y) > INERTIA_THRESH || Math.abs(vel.x) > INERTIA_THRESH;

                if (hasInertia) {
                    rot.y += vel.y;
                    rot.x  = Math.max(-70, Math.min(70, rot.x + vel.x));
                    velRef.current = { y: vel.y * INERTIA_DECAY, x: vel.x * INERTIA_DECAY };
                } else if (sinceEnd > DRAG_MS_RESUME) {
                    // Ease to resting angle, then hold
                    const dLng = rest[0] - rot.y;
                    const dLat = rest[1] - rot.x;
                    const settled = Math.abs(dLng) < 0.4 && Math.abs(dLat) < 0.4;
                    if (!settled) {
                        rot.y += dLng * 0.04;
                        rot.x += dLat * 0.04;
                    }
                }
            }

            // Advance breath (simple per-pin counter)
            const now = Date.now() / 1000;
            for (const p of resolvedPins.current) {
                breathRef.current[p.id] = (Math.sin(now * 0.7 + p.id.charCodeAt(0) * 0.5) + 1) / 2;
            }

            setTick(t => t + 1);
        };
        loop();
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    // Compute SVG geometry each tick
    const cx = containerW / 2;
    const cy = GLOBE_H / 2;
    const radius = (Math.min(containerW, GLOBE_H) / 2) * 0.88;
    const rotLng = rotRef.current.y;
    const rotLat = rotRef.current.x;

    const screenPins: ScreenPin[] = resolvedPins.current.map(p => {
        const pos = projectLatLng(p.lat, p.lng, rotLng, rotLat, cx, cy, radius);
        return {
            id: p.id, name: p.name, relation: p.relation, region: p.region,
            status: p.status, lastCheckInAt: p.lastCheckInAt, lastSeen: p.lastSeen,
            isMe: p.isMe, pinColor: p.pinColor,
            x: pos.x, y: pos.y, visible: pos.visible,
        };
    });

    const visiblePins = screenPins.filter(p => p.visible);

    // Land paths
    const landPaths = useMemo(() => {
        if (!landFeatures.length) return [];
        return landFeatures.flatMap((feat, fi) =>
            feat.rings.map((ring, ri) => ({
                key: `${fi}_${ri}`,
                d: ringToPath(ring, rotLng, rotLat, cx, cy, radius),
            })).filter(x => x.d.length > 4)
        );
    }, [landFeatures, rotLng, rotLat, cx, cy, radius]);

    // Graticule
    const graticulePaths = useMemo(
        () => buildGraticule(rotLng, rotLat, cx, cy, radius),
        [rotLng, rotLat, cx, cy, radius]
    );

    // Constellation lines
    const constellationLines = useMemo(() => {
        const lines: { key: string; d: string; color: string }[] = [];
        for (let i = 0; i < visiblePins.length; i++) {
            for (let j = i + 1; j < visiblePins.length; j++) {
                const a = visiblePins[i], b = visiblePins[j];
                // Use a simple straight line (great-circle arc approximation)
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2 - 14;
                lines.push({
                    key: `${a.id}_${b.id}`,
                    d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
                    color: "rgba(255,218,140,0.32)",
                });
            }
        }
        return lines;
    }, [visiblePins]);

    // Panel animations
    const openPanel = useCallback((pin: ScreenPin) => {
        setSelected(pin);
        Animated.spring(panelAnim, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
    }, [panelAnim]);

    const closePanel = useCallback(() => {
        Animated.timing(panelAnim, {
            toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic),
        }).start(() => setSelected(null));
    }, [panelAnim]);

    const panelTranslate = panelAnim.interpolate({
        inputRange: [0, 1], outputRange: [PANEL_H + 20, 0],
    });
    const panelOpacity = panelAnim.interpolate({
        inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 1],
    });

    // Touch handlers
    const onTouchStart = useCallback((e: any) => {
        const t = e.nativeEvent.touches?.[0] ?? e.nativeEvent;
        isDragging.current = true;
        lastTouch.current  = { x: t.pageX, y: t.pageY };
        velRef.current     = { y: 0, x: 0 };
    }, []);

    const onTouchMove = useCallback((e: any) => {
        const t = e.nativeEvent.touches?.[0] ?? e.nativeEvent;
        if (!isDragging.current || !lastTouch.current) return;
        const dx = t.pageX - lastTouch.current.x;
        const dy = t.pageY - lastTouch.current.y;
        rotRef.current.y  += dx * 0.38;
        rotRef.current.x   = Math.max(-70, Math.min(70, rotRef.current.x + dy * 0.38));
        velRef.current     = { y: dx * 0.28, x: dy * 0.28 };
        lastTouch.current  = { x: t.pageX, y: t.pageY };
    }, []);

    const onTouchEnd = useCallback(() => {
        isDragging.current  = false;
        lastTouch.current   = null;
        lastDragEnd.current = Date.now();
    }, []);

    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerW(e.nativeEvent.layout.width);
    }, []);

    // Caption text
    const captionText = useMemo(() => {
        const hasOverdue = screenPins.some(p => p.status === "away" || p.status === "inactive");
        if (!screenPins.length) return "Add family members to see them here 🌍";
        if (hasOverdue) return "Quiet evening nearby 🌙";
        return "Everyone seems okay today 💛";
    }, [screenPins]);

    return (
        <View style={styles.wrapper} onLayout={onLayout}>
            {/* ── Globe SVG ── */}
            <View
                style={[styles.globeWrap, { width: containerW, height: GLOBE_H }]}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
            >
                <Svg
                    width={containerW}
                    height={GLOBE_H}
                    viewBox={`0 0 ${containerW} ${GLOBE_H}`}
                >
                    <Defs>
                        {/* Globe clip */}
                        <ClipPath id="globeClip">
                            <Circle cx={cx} cy={cy} r={radius} />
                        </ClipPath>

                        {/* Ocean gradient */}
                        <RadialGradient id="oceanGrad" cx="40%" cy="38%" r="80%">
                            <Stop offset="0%"   stopColor="#4a2210" />
                            <Stop offset="40%"  stopColor="#311608" />
                            <Stop offset="80%"  stopColor="#1e0e04" />
                            <Stop offset="100%" stopColor="#130902" />
                        </RadialGradient>

                        {/* Atmospheric halo */}
                        <RadialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
                            <Stop offset="60%"  stopColor="#f59e0b" stopOpacity="0" />
                            <Stop offset="85%"  stopColor="#f59e0b" stopOpacity="0.16" />
                            <Stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                        </RadialGradient>

                        {/* Directional light bloom */}
                        <RadialGradient id="lightBloom" cx="30%" cy="28%" r="80%">
                            <Stop offset="0%"   stopColor="#ffe59b" stopOpacity="0.60" />
                            <Stop offset="22%"  stopColor="#ffd26e" stopOpacity="0.30" />
                            <Stop offset="50%"  stopColor="#ffb446" stopOpacity="0.10" />
                            <Stop offset="75%"  stopColor="#ff8c00" stopOpacity="0" />
                            <Stop offset="100%" stopColor="#000"    stopOpacity="0" />
                        </RadialGradient>

                        {/* Atmosphere veil (softens land edges) */}
                        <RadialGradient id="atmVeil" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%"   stopColor="#fff5e1" stopOpacity="0.04" />
                            <Stop offset="50%"  stopColor="#ffeed2" stopOpacity="0.08" />
                            <Stop offset="80%"  stopColor="#f8e4c3" stopOpacity="0.14" />
                            <Stop offset="100%" stopColor="#f0d7af" stopOpacity="0.27" />
                        </RadialGradient>

                        {/* Rim gradient (applied over full globe) */}
                        <RadialGradient id="rimGrad" cx="50%" cy="50%" r="50%">
                            <Stop offset="72%"  stopColor="#000" stopOpacity="0" />
                            <Stop offset="100%" stopColor="#080200" stopOpacity="0.22" />
                        </RadialGradient>

                        {/* Land gradient */}
                        <RadialGradient id="landGrad" cx="30%" cy="28%" r="90%">
                            <Stop offset="0%"   stopColor="#c8a472" />
                            <Stop offset="50%"  stopColor="#b48454" />
                            <Stop offset="100%" stopColor="#8c5e38" />
                        </RadialGradient>

                        {/* ── Per-pin gradients ── */}
                        {screenPins.map(p => {
                            const uid = p.id.replace(/\W/g, "_");
                            const breath = breathRef.current[p.id] ?? 0.5;
                            const haloAlpha = (0.10 + breath * 0.28).toFixed(3);
                            return (
                                <React.Fragment key={uid}>
                                    {/* Halo */}
                                    <RadialGradient id={`halo_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="0%"   stopColor={p.pinColor} stopOpacity={haloAlpha} />
                                        <Stop offset="35%"  stopColor={p.pinColor} stopOpacity={(parseFloat(haloAlpha)*0.55).toFixed(3)} />
                                        <Stop offset="65%"  stopColor={p.pinColor} stopOpacity={(parseFloat(haloAlpha)*0.18).toFixed(3)} />
                                        <Stop offset="100%" stopColor={p.pinColor} stopOpacity="0" />
                                    </RadialGradient>
                                    {/* Status ring glow */}
                                    <RadialGradient id={`ring_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="60%"  stopColor={p.pinColor} stopOpacity="0" />
                                        <Stop offset="80%"  stopColor={p.pinColor} stopOpacity="0.72" />
                                        <Stop offset="100%" stopColor={p.pinColor} stopOpacity="0" />
                                    </RadialGradient>
                                    {/* Presence token base */}
                                    <RadialGradient id={`ptBase_${uid}`} cx="38%" cy="36%" r="128%">
                                        <Stop offset="0%"   stopColor="#fffcf7" />
                                        <Stop offset="18%"  stopColor="#fdf4e8" />
                                        <Stop offset="46%"  stopColor="#f0ddc0" />
                                        <Stop offset="76%"  stopColor="#d8c09a" />
                                        <Stop offset="100%" stopColor="#bea070" />
                                    </RadialGradient>
                                    {/* Head */}
                                    <RadialGradient id={`ptHead_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="0%"   stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).hOp[0]} />
                                        <Stop offset="38%"  stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).hOp[1]} />
                                        <Stop offset="70%"  stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).hOp[2]} />
                                        <Stop offset="100%" stopColor="#481804" stopOpacity="0" />
                                    </RadialGradient>
                                    {/* Body */}
                                    <RadialGradient id={`ptBody_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="0%"   stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).bOp[0]} />
                                        <Stop offset="36%"  stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).bOp[1]} />
                                        <Stop offset="70%"  stopColor="#481804" stopOpacity={(HINT[p.relation]??HINT.default).bOp[2]} />
                                        <Stop offset="100%" stopColor="#481804" stopOpacity="0" />
                                    </RadialGradient>
                                    {/* Highlight */}
                                    <RadialGradient id={`ptHL_${uid}`} cx="35%" cy="32%" r="100%">
                                        <Stop offset="0%"   stopColor="#fff" stopOpacity="0.74" />
                                        <Stop offset="22%"  stopColor="#fff" stopOpacity="0.28" />
                                        <Stop offset="48%"  stopColor="#fff" stopOpacity="0.07" />
                                        <Stop offset="100%" stopColor="#fff" stopOpacity="0" />
                                    </RadialGradient>
                                    {/* Rim vignette */}
                                    <RadialGradient id={`ptRim_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="62%"  stopColor="#371c06" stopOpacity="0" />
                                        <Stop offset="100%" stopColor="#371c06" stopOpacity="0.38" />
                                    </RadialGradient>
                                    {/* Token clip */}
                                    <ClipPath id={`ptClip_${uid}`}>
                                        <Circle cx={p.visible ? p.x : -9999} cy={p.visible ? p.y : -9999} r={R_AV} />
                                    </ClipPath>
                                </React.Fragment>
                            );
                        })}
                    </Defs>

                    {/* ── Atmospheric halo (outside globe) ── */}
                    <Circle cx={cx} cy={cy} r={radius + 24} fill="url(#haloGrad)" />

                    {/* ── Ocean ── */}
                    <Circle cx={cx} cy={cy} r={radius} fill="url(#oceanGrad)" />

                    {/* ── Land ── */}
                    <G clipPath="url(#globeClip)">
                        {landPaths.map(lp => (
                            <Path key={lp.key} d={lp.d} fill="url(#landGrad)" fillOpacity={0.95} />
                        ))}
                    </G>

                    {/* ── Graticule ── */}
                    <G clipPath="url(#globeClip)">
                        {graticulePaths.map((d, i) => (
                            <Path key={i} d={d} stroke="#c8a86a" strokeWidth={0.5} strokeOpacity={0.20} fill="none" />
                        ))}
                    </G>

                    {/* ── Light bloom ── */}
                    <Circle cx={cx} cy={cy} r={radius} fill="url(#lightBloom)" clipPath="url(#globeClip)" />

                    {/* ── Atmosphere veil ── */}
                    <Circle cx={cx} cy={cy} r={radius} fill="url(#atmVeil)" clipPath="url(#globeClip)" />

                    {/* ── Rim vignette ── */}
                    <Circle cx={cx} cy={cy} r={radius} fill="url(#rimGrad)" clipPath="url(#globeClip)" />

                    {/* ── Globe border rings ── */}
                    {[
                        { offset: 0,    alpha: 0.58, width: 1.8 },
                        { offset: 3.5,  alpha: 0.28, width: 4.0 },
                        { offset: 8,    alpha: 0.13, width: 5.0 },
                        { offset: 14,   alpha: 0.05, width: 6.0 },
                    ].map(ring => (
                        <Circle
                            key={ring.offset}
                            cx={cx} cy={cy} r={radius + ring.offset}
                            fill="none" stroke="#f59e0b"
                            strokeOpacity={ring.alpha} strokeWidth={ring.width}
                        />
                    ))}

                    {/* ── Constellation lines ── */}
                    {constellationLines.map(cl => (
                        <Path key={cl.key} d={cl.d} stroke="#ffdacc" strokeOpacity={0.30} strokeWidth={0.9} fill="none" />
                    ))}

                    {/* ── Pin layers ── */}
                    {visiblePins.map(p => {
                        const uid    = p.id.replace(/\W/g, "_");
                        const breath = breathRef.current[p.id] ?? 0.5;
                        const haloR  = R_AV + 14 + breath * 8;
                        return (
                            <G key={p.id}>
                                {/* ① Breathing halo */}
                                <Circle
                                    cx={p.x} cy={p.y} r={haloR}
                                    fill={`url(#halo_${uid})`}
                                />
                                {/* ② Status ring glow */}
                                <Circle
                                    cx={p.x} cy={p.y} r={R_AV + 7}
                                    fill={`url(#ring_${uid})`}
                                />
                                {/* ③ Presence token */}
                                <PresenceTokenSVG
                                    cx={p.x} cy={p.y} r={R_AV}
                                    pinColor={p.pinColor}
                                    relation={p.relation}
                                    uid={uid}
                                />
                                {/* ④ Status ring border */}
                                <Circle
                                    cx={p.x} cy={p.y} r={R_AV + 2.5}
                                    fill="none"
                                    stroke={p.pinColor}
                                    strokeWidth={2.2}
                                    strokeOpacity={0.85}
                                />
                            </G>
                        );
                    })}
                </Svg>

                {/* ── Name pills (React Native overlay, above SVG) ── */}
                {visiblePins.map(p => {
                    const PILL_W = p.name.length * 7.5 + 26;
                    const PILL_H = 22;
                    const STEM_H = 7;
                    // Position pill above the token
                    const pillLeft  = p.x - PILL_W / 2;
                    const pillTop   = p.y - R_AV - STEM_H - PILL_H - 4;
                    const isSel     = selected?.id === p.id;
                    return (
                        <Pressable
                            key={`pill_${p.id}`}
                            style={[
                                styles.namePillWrap,
                                {
                                    left: pillLeft,
                                    top: pillTop,
                                    width: PILL_W,
                                    height: PILL_H + STEM_H + 4,
                                },
                            ]}
                            onPress={() => openPanel(p)}
                            hitSlop={12}
                        >
                            {/* Pill */}
                            <View style={[
                                styles.namePill,
                                {
                                    width: PILL_W,
                                    height: PILL_H,
                                    borderColor: isSel ? `${p.pinColor}88` : "rgba(255,255,255,0.42)",
                                    shadowColor: isSel ? p.pinColor : "#000",
                                },
                            ]}>
                                <View style={[styles.pillDot, { backgroundColor: p.pinColor }]} />
                                <Text style={styles.pillText}>{p.name}</Text>
                            </View>
                            {/* Stem */}
                            <View style={[styles.pillStem, { backgroundColor: p.pinColor }]} />
                        </Pressable>
                    );
                })}

                {/* ── Tap target on pin itself ── */}
                {visiblePins.map(p => (
                    <Pressable
                        key={`tap_${p.id}`}
                        style={[
                            styles.pinTap,
                            { left: p.x - R_AV - 6, top: p.y - R_AV - 6 },
                        ]}
                        onPress={() => openPanel(p)}
                        hitSlop={8}
                    />
                ))}

                {/* Empty state */}
                {screenPins.length === 0 && (
                    <View style={styles.emptyHint} pointerEvents="none">
                        <Text style={styles.emptyHintText}>Pins appear once members set their city</Text>
                    </View>
                )}
            </View>

            {/* ── Caption below globe ── */}
            <View style={styles.captionRow}>
                <Text style={styles.captionText}>{captionText}</Text>
            </View>

            {/* ── Detail panel ── */}
            {selected && (
                <Animated.View
                    style={[
                        styles.panel,
                        { transform: [{ translateY: panelTranslate }], opacity: panelOpacity },
                    ]}
                >
                    <View style={styles.panelHandle} />
                    <View style={styles.panelRow}>
                        {/* Mini token in panel */}
                        <View style={[styles.panelToken, { borderColor: `${selected.pinColor}50` }]}>
                            <View style={[styles.panelTokenInner, { backgroundColor: `${selected.pinColor}18` }]}>
                                <Text style={[styles.panelTokenText, { color: selected.pinColor }]}>
                                    {selected.name[0]?.toUpperCase() ?? "?"}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.panelInfo}>
                            <Text style={styles.panelName}>{selected.name}</Text>
                            <Text style={styles.panelRelation}>{selected.relation}</Text>
                            {selected.region ? (
                                <View style={styles.panelLocationRow}>
                                    <Feather name="map-pin" size={11} color={BRAND.textMuted} />
                                    <Text style={styles.panelLocation}>{selected.region}</Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={styles.panelStatusWrap}>
                            <View style={[styles.statusDot, { backgroundColor: STATUS_PIN_COLOR[selected.status] ?? "#9ca3af" }]} />
                            <Text style={[styles.statusText, { color: STATUS_PIN_COLOR[selected.status] ?? "#9ca3af" }]}>
                                {STATUS_LABEL[selected.status]}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.panelMeta}>
                        <View style={styles.metaItem}>
                            <Feather name="clock" size={12} color={BRAND.textMuted} />
                            <Text style={styles.metaLabel}>Last seen</Text>
                            <Text style={styles.metaValue}>{formatLastSeen(selected.lastSeen)}</Text>
                        </View>
                        <View style={styles.metaDivider} />
                        <View style={styles.metaItem}>
                            <Feather name="check-circle" size={12} color={BRAND.textMuted} />
                            <Text style={styles.metaLabel}>Check-in</Text>
                            <Text style={styles.metaValue}>{formatLastSeen(selected.lastCheckInAt)}</Text>
                        </View>
                    </View>

                    <View style={styles.panelActions}>
                        <Pressable
                            style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.78 }]}
                            onPress={() => {
                                closePanel();
                                router.push({ pathname: "/member/[id]", params: { id: selected.id } });
                            }}
                        >
                            <Text style={styles.viewBtnText}>View full profile</Text>
                            <Feather name="arrow-right" size={14} color="#fff" />
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.65 }]}
                            onPress={closePanel}
                            hitSlop={8}
                        >
                            <Feather name="x" size={18} color={BRAND.textMuted} />
                        </Pressable>
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    wrapper: {
        marginBottom: 12,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: BRAND.backgroundCard ?? "#FFFBEB",
        borderWidth: 1,
        borderColor: `${BRAND.primary}28`,
    },
    globeWrap: {
        position: "relative",
        overflow: "hidden",
        backgroundColor: "transparent",
    },
    namePillWrap: {
        position: "absolute",
        alignItems: "center",
        zIndex: 10,
    },
    namePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 20,
        backgroundColor: "rgba(255,251,235,0.95)",
        borderWidth: 1,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
        elevation: 4,
    },
    pillDot: {
        width: 7, height: 7, borderRadius: 3.5,
    },
    pillText: {
        fontSize: 11,
        fontFamily: "Inter_600SemiBold",
        color: "#1A1A1A",
        letterSpacing: 0.15,
    },
    pillStem: {
        width: 1.5,
        height: 7,
        opacity: 0.65,
        marginTop: 0,
    },
    pinTap: {
        position: "absolute",
        width: (R_AV + 6) * 2,
        height: (R_AV + 6) * 2,
        zIndex: 9,
    },
    emptyHint: {
        position: "absolute",
        bottom: 12, left: 0, right: 0,
        alignItems: "center",
    },
    emptyHintText: {
        fontSize: 12,
        fontFamily: "Inter_400Regular",
        color: "rgba(139,100,56,0.55)",
    },
    captionRow: {
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: `${BRAND.primary}15`,
    },
    captionText: {
        fontSize: 12.5,
        fontFamily: "Inter_500Medium",
        color: "#8a6520",
        opacity: 0.88,
        textAlign: "center",
        letterSpacing: 0.3,
    },
    panel: {
        backgroundColor: BRAND.backgroundCard ?? "#FFFBEB",
        borderTopWidth: 1,
        borderTopColor: `${BRAND.primary}25`,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    panelHandle: {
        width: 36, height: 4, borderRadius: 2,
        backgroundColor: BRAND.borderLight ?? "#F0E2C4",
        alignSelf: "center", marginBottom: 14,
    },
    panelRow: {
        flexDirection: "row", alignItems: "center",
        gap: 14, marginBottom: 14,
    },
    panelToken: {
        width: 52, height: 52, borderRadius: 26,
        borderWidth: 2, alignItems: "center", justifyContent: "center",
    },
    panelTokenInner: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: "center", justifyContent: "center",
    },
    panelTokenText: {
        fontSize: 20, fontFamily: "Inter_700Bold",
    },
    panelInfo: { flex: 1, gap: 2 },
    panelName: { fontSize: 17, fontFamily: "Inter_700Bold", color: BRAND.text },
    panelRelation: { fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textSecondary },
    panelLocationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
    panelLocation: { fontSize: 12, fontFamily: "Inter_400Regular", color: BRAND.textMuted },
    panelStatusWrap: { alignItems: "center", gap: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
    panelMeta: {
        flexDirection: "row", alignItems: "center",
        backgroundColor: `${BRAND.primary}08`,
        borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
        marginBottom: 14, borderWidth: 1, borderColor: `${BRAND.primary}18`,
    },
    metaItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
    metaLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: BRAND.textMuted },
    metaValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: BRAND.textSecondary },
    metaDivider: { width: 1, height: 24, backgroundColor: `${BRAND.primary}20`, marginHorizontal: 10 },
    panelActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    viewBtn: {
        flex: 1, flexDirection: "row", alignItems: "center",
        justifyContent: "center", gap: 6,
        backgroundColor: BRAND.primary, borderRadius: 12, paddingVertical: 12,
    },
    viewBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
    closeBtn: {
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: `${BRAND.primary}12`,
        alignItems: "center", justifyContent: "center",
        borderWidth: 1, borderColor: `${BRAND.primary}28`,
    },
});