/**
 * GlobeWebView.tsx — Pure React Native SVG globe, no WebView
 * Uses react-native-svg + PanResponder. Zero native module dependencies.
 */
import React, {
    forwardRef, useCallback, useEffect, useImperativeHandle,
    useMemo, useRef, useState,
} from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
    Circle, ClipPath, Defs, G, Path, RadialGradient, Stop,
} from "react-native-svg";

// ── Types ─────────────────────────────────────────────────────────────────
export interface GlobeViewMember {
    id: string; name: string; lat: number; lng: number;
    pinColor: string; relation: string; status: "OK" | "OVERDUE" | "ALERT";
}
export interface GlobeWebViewRef {
    focusMember:  (id: string) => void;
    clearFocus:   () => void;
    setAlertMode: (v: boolean) => void;
    setMembers:   (ms: GlobeViewMember[]) => void;
}
interface Props {
    members: GlobeViewMember[];
    alertMode: boolean;
    size: number;
    onPinTap: (id: string) => void;
}

// ── Continent outlines [lng, lat] ─────────────────────────────────────────
const LAND: [number, number][][] = [
    [[-168,72],[-168,66],[-165,62],[-168,55],[-160,58],[-150,60],[-140,60],[-135,58],[-130,56],[-130,60],[-140,62],[-150,60],[-160,60],[-165,64],[-168,66],[-168,72]],
    [[-140,60],[-130,56],[-125,50],[-124,48],[-115,49],[-100,49],[-85,49],[-75,45],[-72,45],[-70,47],[-72,41],[-76,35],[-80,32],[-85,30],[-90,29],[-94,29],[-97,26],[-99,20],[-96,19],[-90,16],[-84,20],[-75,22],[-70,20],[-75,22],[-80,22],[-84,20],[-90,18],[-92,20],[-95,22],[-97,26],[-105,23],[-110,23],[-115,30],[-118,34],[-122,37],[-124,42],[-124,48],[-125,50],[-130,56],[-135,58],[-140,60]],
    [[-45,60],[-42,65],[-18,77],[-20,82],[-35,84],[-55,83],[-65,82],[-60,75],[-45,70],[-42,65],[-45,60]],
    [[-82,10],[-78,6],[-72,12],[-63,10],[-60,5],[-52,4],[-50,0],[-45,-1],[-35,-5],[-35,-10],[-38,-15],[-40,-20],[-44,-24],[-48,-27],[-50,-30],[-53,-33],[-58,-38],[-62,-40],[-65,-44],[-68,-50],[-70,-52],[-68,-55],[-66,-56],[-65,-55],[-65,-46],[-68,-40],[-65,-34],[-70,-30],[-72,-24],[-75,-15],[-78,-5],[-80,0],[-78,4],[-80,8],[-82,10]],
    [[5,58],[-2,52],[-5,48],[0,43],[3,44],[8,44],[12,44],[14,41],[16,38],[18,40],[22,38],[24,38],[26,40],[28,42],[30,44],[32,47],[30,52],[25,55],[22,58],[20,58],[18,60],[15,60],[12,57],[15,56],[18,56],[20,60],[22,64],[26,68],[28,70],[25,72],[20,70],[16,70],[14,68],[12,66],[10,62],[5,58]],
    [[-8,44],[-6,44],[-2,44],[0,44],[0,40],[0,36],[-6,36],[-8,38],[-10,40],[-8,44]],
    [[8,44],[10,44],[14,42],[16,40],[16,38],[14,36],[12,38],[10,42],[8,44]],
    [[14,46],[16,46],[20,46],[24,44],[28,44],[28,40],[24,40],[22,38],[20,38],[16,40],[14,44],[14,46]],
    [[26,38],[30,40],[34,42],[38,40],[42,38],[40,36],[36,36],[32,36],[28,36],[26,38]],
    [[-16,16],[-15,10],[-15,5],[-10,5],[0,5],[5,4],[10,5],[15,5],[20,4],[25,4],[32,0],[36,-1],[40,-5],[42,-10],[40,-15],[36,-20],[35,-25],[32,-28],[30,-30],[28,-34],[22,-34],[18,-34],[14,-30],[12,-24],[10,-18],[10,-5],[10,4],[8,5],[5,8],[0,6],[-5,4],[-8,5],[-12,8],[-15,10],[-16,16]],
    [[44,-12],[48,-12],[50,-16],[50,-20],[48,-24],[46,-26],[44,-24],[44,-18],[44,-12]],
    [[25,72],[40,72],[60,72],[80,74],[100,73],[120,72],[140,70],[160,62],[168,56],[165,60],[150,60],[140,55],[135,48],[132,44],[130,42],[128,38],[120,32],[118,24],[115,22],[108,20],[105,10],[105,5],[100,2],[100,6],[98,10],[95,14],[88,22],[84,28],[80,28],[75,32],[70,36],[66,38],[62,38],[58,38],[52,36],[48,32],[44,28],[40,28],[38,36],[36,36],[30,36],[28,38],[26,42],[28,46],[32,52],[36,56],[40,60],[45,66],[50,68],[60,72],[25,72]],
    [[68,24],[72,22],[76,20],[80,14],[82,10],[80,8],[76,8],[74,14],[72,18],[70,22],[68,24]],
    [[100,2],[105,5],[108,10],[110,14],[108,20],[115,22],[118,24],[120,28],[115,28],[110,24],[108,18],[105,14],[105,10],[100,6],[100,2]],
    [[108,2],[112,4],[116,6],[118,6],[120,4],[118,2],[116,0],[114,-2],[112,-2],[110,0],[108,2]],
    [[96,6],[98,4],[100,2],[104,0],[106,-2],[104,-5],[102,-4],[100,-2],[98,2],[96,4],[96,6]],
    [[132,-2],[136,-4],[140,-5],[144,-4],[148,-6],[148,-8],[144,-8],[140,-8],[136,-8],[132,-6],[132,-2]],
    [[130,32],[132,34],[134,36],[136,36],[138,38],[140,40],[142,42],[144,44],[142,44],[140,42],[138,40],[136,38],[134,36],[132,34],[130,32]],
    [[114,-22],[116,-20],[120,-18],[125,-14],[130,-12],[136,-12],[140,-14],[144,-16],[148,-18],[150,-22],[152,-26],[152,-30],[150,-36],[148,-38],[144,-38],[140,-36],[135,-35],[130,-35],[126,-34],[122,-34],[116,-34],[114,-30],[112,-26],[112,-22],[114,-22]],
    [[166,-46],[168,-46],[170,-44],[172,-42],[174,-40],[176,-38],[174,-36],[172,-36],[170,-38],[168,-40],[166,-42],[166,-46]],
    [[-8,52],[-6,52],[-2,52],[0,52],[2,52],[0,54],[-2,56],[-4,58],[-6,58],[-8,56],[-8,54],[-8,52]],
    [[-24,64],[-18,64],[-14,65],[-12,66],[-14,68],[-18,68],[-22,66],[-24,64]],
];

// ── Projection ────────────────────────────────────────────────────────────
const D2R = Math.PI / 180;

function project(lat: number, lng: number, ry: number, rx: number, cx: number, cy: number, R: number) {
    const phi  = lat * D2R, lam = (lng - ry) * D2R, phi0 = rx * D2R;
    const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
    if (cosC < 0.015) return null;
    return {
        x: cx + R * Math.cos(phi) * Math.sin(lam),
        y: cy - R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam)),
    };
}

function landPath(ring: [number, number][], ry: number, rx: number, cx: number, cy: number, R: number): string {
    let d = "", pen = false;
    for (const [lng, lat] of ring) {
        const p = project(lat, lng, ry, rx, cx, cy, R);
        if (p) { d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true; }
        else if (pen) { d += "Z"; pen = false; }
    }
    return pen ? d + "Z" : d;
}

function graticule(ry: number, rx: number, cx: number, cy: number, R: number): string[] {
    const out: string[] = [];
    for (let la = -60; la <= 60; la += 30) {
        let d = "", pen = false;
        for (let lo = -180; lo <= 180; lo += 5) {
            const p = project(la, lo, ry, rx, cx, cy, R);
            if (p) { d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true; }
            else if (pen) break;
        }
        if (d.length > 3) out.push(d);
    }
    for (let lo = -180; lo < 180; lo += 30) {
        let d = "", pen = false;
        for (let la = -90; la <= 90; la += 5) {
            const p = project(la, lo, ry, rx, cx, cy, R);
            if (p) { d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`; pen = true; }
            else if (pen) break;
        }
        if (d.length > 3) out.push(d);
    }
    return out;
}

// ── Constants ─────────────────────────────────────────────────────────────
const TOKEN_R    = 18;
const PILL_PAD   = 44; // extra height above globe for name pill overflow
const FPS_TARGET = 1000 / 60;

// ── Component ─────────────────────────────────────────────────────────────
export const GlobeWebView = forwardRef<GlobeWebViewRef, Props>(
    function GlobeWebView({ members: initMembers, alertMode: initAlert, size, onPinTap }, ref) {
        // ── mutable state in refs (no setState in RAF) ──
        const rotY        = useRef(20);
        const rotX        = useRef(20);
        const velY        = useRef(0);
        const velX        = useRef(0);
        const dragging    = useRef(false);
        const lastDrag    = useRef(0);
        const focusTarget = useRef<{ y: number; x: number } | null>(null);
        const breathT     = useRef(0);
        const membersRef  = useRef(initMembers);
        const alertRef    = useRef(initAlert);
        const rafRef      = useRef<number>(0);
        const lastFlush   = useRef(0);

        // ── single frame snapshot pushed to React ──
        const [frame, setFrame] = useState({ ry: 20, rx: 20, bt: 0, alert: initAlert, members: initMembers, seq: 0 });

        // ── resting rotation (pure calc, no state dep) ──
        const computeResting = useCallback(() => {
            const ms = membersRef.current;
            if (!ms.length) return { y: 20, x: 20 };
            const aLng = ms.reduce((s, m) => s + m.lng, 0) / ms.length;
            const aLat = ms.reduce((s, m) => s + m.lat, 0) / ms.length;
            return { y: -aLng, x: -aLat * 0.55 };
        }, []);

        // ── RAF loop — only calls setFrame at ~60fps, never re-triggers useEffect ──
        useEffect(() => {
            let running = true;
            const tick = () => {
                if (!running) return;
                rafRef.current = requestAnimationFrame(tick);

                breathT.current += 0.018;

                // rotation physics
                const focus = focusTarget.current;
                if (focus) {
                    rotY.current += (focus.y - rotY.current) * 0.06;
                    rotX.current += (focus.x - rotX.current) * 0.06;
                    if (Math.abs(focus.y - rotY.current) < 0.3 && Math.abs(focus.x - rotX.current) < 0.3)
                        focusTarget.current = null;
                } else if (!dragging.current) {
                    if (Math.abs(velY.current) > 0.01 || Math.abs(velX.current) > 0.01) {
                        rotY.current += velY.current;
                        rotX.current = Math.max(-70, Math.min(70, rotX.current + velX.current));
                        velY.current *= 0.92; velX.current *= 0.92;
                    } else if (Date.now() - lastDrag.current > 2200) {
                        const rest = computeResting();
                        rotY.current += (rest.y - rotY.current) * 0.025;
                        rotX.current += (rest.x - rotX.current) * 0.025;
                    }
                }

                // throttle React updates to ~60fps
                const now = Date.now();
                if (now - lastFlush.current < FPS_TARGET - 2) return;
                lastFlush.current = now;

                // use functional update so we never close over stale frame
                setFrame(prev => ({
                    ry: rotY.current,
                    rx: rotX.current,
                    bt: breathT.current,
                    alert: alertRef.current,
                    members: membersRef.current,
                    seq: prev.seq + 1,
                }));
            };
            tick();
            return () => { running = false; cancelAnimationFrame(rafRef.current); };
        }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally stable

        // ── ref API ──
        useImperativeHandle(ref, () => ({
            focusMember: (id) => {
                const m = membersRef.current.find(x => x.id === id);
                if (m) focusTarget.current = { y: -m.lng, x: -m.lat * 0.55 };
            },
            clearFocus:   () => { focusTarget.current = null; },
            setAlertMode: (v) => { alertRef.current = v; },
            setMembers:   (ms) => { membersRef.current = ms; },
        }), []);

        // ── PanResponder ──
        const pan = useMemo(() => PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder:  () => true,
            onPanResponderGrant: () => {
                dragging.current = true;
                focusTarget.current = null;
                velY.current = 0; velX.current = 0;
            },
            onPanResponderMove: (_, g) => {
                const dY = g.vx * 2.4, dX = g.vy * 2.4;
                rotY.current += dY;
                rotX.current = Math.max(-70, Math.min(70, rotX.current + dX));
                velY.current = dY * 0.75 + velY.current * 0.25;
                velX.current = dX * 0.75 + velX.current * 0.25;
            },
            onPanResponderRelease:   () => { dragging.current = false; lastDrag.current = Date.now(); },
            onPanResponderTerminate: () => { dragging.current = false; lastDrag.current = Date.now(); },
        }), []); // eslint-disable-line react-hooks/exhaustive-deps

        // ── derived geometry from frame snapshot ──
        const { ry, rx, bt, alert: isAlert, members } = frame;
        const cx = size / 2;
        const cy = size / 2 + PILL_PAD;
        const R  = size / 2 - 3;

        const landPaths = useMemo(() =>
                LAND.map((ring, i) => ({ key: `l${i}`, d: landPath(ring, ry, rx, cx, cy, R) }))
                    .filter(p => p.d.length > 4),
            [ry, rx, cx, cy, R],
        );

        const gratPaths = useMemo(() => graticule(ry, rx, cx, cy, R), [ry, rx, cx, cy, R]);

        const pins = useMemo(() => members.map((m, i) => {
            const p = project(m.lat, m.lng, ry, rx, cx, cy, R);
            const color = isAlert ? "#ef4444" : m.pinColor;
            const bv = (Math.sin(bt * 0.7 + i * 0.9) + 1) / 2;
            return { ...m, pos: p, color, bv };
        }), [members, ry, rx, cx, cy, R, isAlert, bt]);

        const visPins = pins.filter(p => p.pos !== null);
        const rimColor = isAlert ? "#ef4444" : "#f59e0b";
        const totalH = size + PILL_PAD;

        return (
            <View style={{ width: size, height: totalH }} {...pan.panHandlers}>
                <Svg width={size} height={totalH} style={StyleSheet.absoluteFill}>
                    <Defs>
                        <ClipPath id="gc"><Circle cx={cx} cy={cy} r={R} /></ClipPath>

                        <RadialGradient id="atmo" cx="50%" cy="50%" r="50%">
                            <Stop offset="58%" stopColor={rimColor} stopOpacity="0" />
                            <Stop offset="80%" stopColor={rimColor} stopOpacity="0.26" />
                            <Stop offset="100%" stopColor={rimColor} stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="ocean" cx="30%" cy="28%" r="90%">
                            <Stop offset="0%"   stopColor="#5a2c12" />
                            <Stop offset="40%"  stopColor="#3d1a08" />
                            <Stop offset="80%"  stopColor="#251005" />
                            <Stop offset="100%" stopColor="#180b03" />
                        </RadialGradient>
                        <RadialGradient id="land" cx="30%" cy="28%" r="90%">
                            <Stop offset="0%"   stopColor="#dbb07a" />
                            <Stop offset="45%"  stopColor="#c4925c" />
                            <Stop offset="75%"  stopColor="#a87040" />
                            <Stop offset="100%" stopColor="#8a5830" />
                        </RadialGradient>
                        <RadialGradient id="bloom" cx="26%" cy="24%" r="85%">
                            <Stop offset="0%"   stopColor="#ffe49a" stopOpacity="0.72" />
                            <Stop offset="22%"  stopColor="#ffcc60" stopOpacity="0.38" />
                            <Stop offset="45%"  stopColor="#ffac30" stopOpacity="0.12" />
                            <Stop offset="70%"  stopColor="#000"    stopOpacity="0" />
                            <Stop offset="100%" stopColor="#000"    stopOpacity="0.16" />
                        </RadialGradient>
                        <RadialGradient id="veil" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%"   stopColor="#fff5e1" stopOpacity="0.04" />
                            <Stop offset="55%"  stopColor="#ffeed2" stopOpacity="0.10" />
                            <Stop offset="82%"  stopColor="#f8e4c3" stopOpacity="0.20" />
                            <Stop offset="100%" stopColor="#f0d7af" stopOpacity="0.36" />
                        </RadialGradient>
                        <RadialGradient id="rimsh" cx="50%" cy="50%" r="50%">
                            <Stop offset="70%"  stopColor="#000" stopOpacity="0" />
                            <Stop offset="100%" stopColor="#080200" stopOpacity="0.24" />
                        </RadialGradient>

                        {/* Per-pin gradients */}
                        {visPins.map(p => {
                            const uid = p.id.replace(/\W/g, "_");
                            return (
                                <React.Fragment key={uid}>
                                    <RadialGradient id={`h_${uid}`} cx="50%" cy="50%" r="50%">
                                        <Stop offset="0%"   stopColor={p.color} stopOpacity={(0.10 + p.bv * 0.28).toFixed(2)} />
                                        <Stop offset="45%"  stopColor={p.color} stopOpacity={(0.04 + p.bv * 0.10).toFixed(2)} />
                                        <Stop offset="100%" stopColor={p.color} stopOpacity="0" />
                                    </RadialGradient>
                                    <RadialGradient id={`t_${uid}`} cx="35%" cy="32%" r="120%">
                                        <Stop offset="0%"   stopColor="#fffcf7" />
                                        <Stop offset="20%"  stopColor="#fdf4e8" />
                                        <Stop offset="50%"  stopColor="#f0ddc0" />
                                        <Stop offset="80%"  stopColor="#d8c09a" />
                                        <Stop offset="100%" stopColor="#bea070" />
                                    </RadialGradient>
                                    <RadialGradient id={`th_${uid}`} cx="33%" cy="29%" r="100%">
                                        <Stop offset="0%"   stopColor="#fff" stopOpacity="0.78" />
                                        <Stop offset="24%"  stopColor="#fff" stopOpacity="0.28" />
                                        <Stop offset="55%"  stopColor="#fff" stopOpacity="0.07" />
                                        <Stop offset="100%" stopColor="#fff" stopOpacity="0" />
                                    </RadialGradient>
                                </React.Fragment>
                            );
                        })}
                    </Defs>

                    {/* Atmospheric halo */}
                    <Circle cx={cx} cy={cy} r={R + 30} fill="url(#atmo)" />

                    {/* Globe */}
                    <G clipPath="url(#gc)">
                        <Circle cx={cx} cy={cy} r={R} fill="url(#ocean)" />
                        {gratPaths.map((d, i) => (
                            <Path key={`g${i}`} d={d} fill="none" stroke="#c8a86a" strokeWidth={0.5} strokeOpacity={0.18} />
                        ))}
                        {landPaths.map(p => <Path key={p.key} d={p.d} fill="url(#land)" fillOpacity={0.96} />)}
                        <Circle cx={cx} cy={cy} r={R} fill="url(#bloom)" />
                        <Circle cx={cx} cy={cy} r={R} fill="url(#veil)" />
                        <Circle cx={cx} cy={cy} r={R} fill="url(#rimsh)" />
                    </G>

                    {/* Rim rings */}
                    {([[0,0.72,2.2],[4,0.38,5],[9,0.16,6],[16,0.07,7],[26,0.03,8]] as [number,number,number][]).map(([off,op,w],i) => (
                        <Circle key={`rim${i}`} cx={cx} cy={cy} r={R+off} fill="none" stroke={rimColor} strokeOpacity={op} strokeWidth={w} />
                    ))}

                    {/* Constellation lines */}
                    {visPins.flatMap((a, i) => visPins.slice(i + 1).map(b => (
                        <Path
                            key={`arc_${a.id}_${b.id}`}
                            d={`M${a.pos!.x.toFixed(1)},${a.pos!.y.toFixed(1)} Q${((a.pos!.x+b.pos!.x)/2).toFixed(1)},${(((a.pos!.y+b.pos!.y)/2)-14).toFixed(1)} ${b.pos!.x.toFixed(1)},${b.pos!.y.toFixed(1)}`}
                            fill="none" stroke="rgba(255,218,140,0.26)" strokeWidth={0.9}
                        />
                    )))}

                    {/* Pins */}
                    {visPins.map(p => {
                        const uid = p.id.replace(/\W/g, "_");
                        const { x, y } = p.pos!;
                        const hr = TOKEN_R + 14 + p.bv * 10;
                        return (
                            <G key={p.id}>
                                <Circle cx={x} cy={y} r={hr} fill={`url(#h_${uid})`} />
                                <Circle cx={x} cy={y} r={TOKEN_R + 7} fill="none" stroke={p.color} strokeWidth={5} strokeOpacity={0.20 + p.bv * 0.16} />
                                <Circle cx={x} cy={y} r={TOKEN_R} fill={`url(#t_${uid})`} />
                                <Circle cx={x} cy={y} r={TOKEN_R} fill={p.color} fillOpacity={0.11} />
                                <Circle cx={x} cy={y} r={TOKEN_R} fill={`url(#th_${uid})`} />
                                <Circle cx={x} cy={y} r={TOKEN_R + 3} fill="none" stroke={p.color} strokeWidth={3} strokeOpacity={0.88} />
                            </G>
                        );
                    })}
                </Svg>

                {/* Name pills — RN Views so text renders natively */}
                {visPins.map(p => {
                    const { x, y } = p.pos!;
                    const pillW = Math.max(p.name.length * 7.8 + 28, 56);
                    return (
                        <View key={`pill_${p.id}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                            <Pressable
                                onPress={() => onPinTap(p.id)}
                                hitSlop={10}
                                style={[styles.pill, { left: x - pillW / 2, top: y - TOKEN_R - 8 - 22 - 2, width: pillW }]}
                            >
                                <View style={[styles.pillDot, { backgroundColor: p.color }]} />
                                <Text style={styles.pillText}>{p.name}</Text>
                            </Pressable>
                            <View style={[styles.stem, { left: x - 1, top: y - TOKEN_R - 8, height: 8, backgroundColor: p.color }]} />
                        </View>
                    );
                })}

                {/* Token tap targets */}
                {visPins.map(p => {
                    const { x, y } = p.pos!;
                    const s = (TOKEN_R + 10) * 2;
                    return (
                        <Pressable key={`tap_${p.id}`} onPress={() => onPinTap(p.id)}
                                   style={[styles.tapTarget, { left: x - s / 2, top: y - s / 2, width: s, height: s }]} />
                    );
                })}
            </View>
        );
    },
);

const styles = StyleSheet.create({
    pill: {
        position: "absolute",
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: "rgba(255,251,235,0.96)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.50)",
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18, shadowRadius: 6, elevation: 4,
    },
    pillDot:  { width: 7, height: 7, borderRadius: 3.5 },
    pillText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#1a1a1a", letterSpacing: 0.1 },
    stem:     { position: "absolute", width: 2, opacity: 0.58, borderRadius: 1 },
    tapTarget:{ position: "absolute", borderRadius: 999 },
});