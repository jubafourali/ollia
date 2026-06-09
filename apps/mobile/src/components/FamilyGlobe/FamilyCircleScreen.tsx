import React, {
    useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
    Animated, Dimensions, Easing, Image,
    Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { PresenceToken } from "./PresenceToken";
import { GlobeMember, ResolvedPin } from "./types";
import {
    resolveMembers, formatLastSeen, STATUS_PIN_COLOR as _STATUS_PIN_COLOR,
} from "./globeUtils";
import { Phase, getPhase, SKY, PHASE_EMOJI, usePhase } from "@/components/SkyBackground";

// Emotional status color palette — atmosphere, not UI
const STATUS_PIN_COLOR: Record<string, string> = {
    active:   "#5cb887",   // soft sage — calm, alive
    recent:   "#f59e0b",   // warm amber — recently present
    away:     "#7c6fa0",   // muted indigo — quiet, drifting
    inactive: "#f59e0b",   // warm amber — worth checking in
};

const { width: SW, height: SH } = Dimensions.get("window");

export type SafetyEvent = {
    id: string; icon: string; title: string;
    source: string; region: string;
    severity: "high" | "medium" | "low";
    memberId?: string;
    sentence?: string;        // SAIAE calm, verified sentence (preferred body copy)
    confidenceTier?: string;  // HIGH | MODERATE | LOW
};

type Props = {
    members: GlobeMember[];
    meRegion?: string;
    events?: SafetyEvent[];
    onInvite?: () => void;
    onMemberPress?: (id: string) => void;
};

// ── Per-member card sky (independent of the screen background) ──────────────
const CARD_BG: Record<Phase, {
    bg: string; label: string; labelColor: string;
    text: string; dim: string; pill: string;
    moon: boolean; sun: boolean; sunColor: string; stars: boolean;
}> = {
    latenight: { bg:"#0c0828", label:"Late night",   labelColor:"#a090d8", text:"#ede8ff", dim:"#a090d8", pill:"rgba(0,0,0,0.55)", moon:true,  sun:false, sunColor:"",        stars:true  },
    night:     { bg:"#11093e", label:"Night",         labelColor:"#b8a8e8", text:"#ede8ff", dim:"#b8a8e8", pill:"rgba(0,0,0,0.55)", moon:true,  sun:false, sunColor:"",        stars:true  },
    dawn:      { bg:"#16082e", label:"Dawn",          labelColor:"#d890b8", text:"#f8e8f4", dim:"#d890b8", pill:"rgba(0,0,0,0.50)", moon:true,  sun:false, sunColor:"",        stars:false },
    morning:   { bg:"#6e2010", label:"Morning",       labelColor:"#ffd080", text:"#fff4e0", dim:"#ffc060", pill:"rgba(0,0,0,0.40)", moon:false, sun:true,  sunColor:"#ffe880", stars:false },
    day:       { bg:"#0a3d8c", label:"Daytime",       labelColor:"#a8d4ff", text:"#ffffff", dim:"#a8d4ff", pill:"rgba(0,0,0,0.30)", moon:false, sun:true,  sunColor:"#fff8a0", stars:false },
    golden:    { bg:"#6e2400", label:"Golden hour",   labelColor:"#ffc860", text:"#fff0c0", dim:"#ffaa40", pill:"rgba(0,0,0,0.40)", moon:false, sun:true,  sunColor:"#ffe060", stars:false },
    dusk:      { bg:"#1a0840", label:"Dusk",          labelColor:"#d890b0", text:"#f8e0f0", dim:"#d890b0", pill:"rgba(0,0,0,0.50)", moon:false, sun:false, sunColor:"",        stars:true  },
};

// ── Emotional copy ─────────────────────────────────────────────────────────
function heroSubtext(pins: ResolvedPin[], hasAlert: boolean): { text: string; color: string } {
    if (pins.length === 0) return { text: "Invite someone to your circle", color: "#a090d8" };
    if (hasAlert) return { text: "Something nearby worth checking ⚠", color: "#ef4444" };
    const active = pins.filter(p => p.status === "active" || p.status === "recent");
    const quiet  = pins.filter(p => p.status === "away"   || p.status === "inactive");
    if (quiet.length === 0) {
        const h = new Date().getHours();
        if (h >= 21 || h < 6)  return { text: "Quiet evening across your circle 🌙", color: "#a090d8" };
        if (h >= 6  && h < 12) return { text: "Good morning! everyone seems settled ☀️", color: "#10b981" };
        return { text: `Things seem calm — all ${pins.length} 💛`, color: "#10b981" };
    }
    if (active.length === 0) return { text: "Everyone's been quiet for a while 🌙", color: "#a090d8" };
    return { text: `Quiet night across your circle`, color: "#f59e0b" };
}

function statusLabel(pin: ResolvedPin): string {
    // Bottom pill shows check-in time, not repeated status badge
    const lastSeen = pin.lastCheckInAt ?? pin.lastSeen;
    switch (pin.status) {
        case "active":   return "✓ Checked in · everything quiet";
        case "recent":   return "✓ Recently active";
        case "away":
        case "inactive": return `Last seen ${formatLastSeen(lastSeen)}`;
        default:         return `Last seen ${formatLastSeen(lastSeen)}`;
    }
}

function quietBadge(pin: ResolvedPin): string | null {
    if (pin.status === "away")     return "Quiet for a while";
    if (pin.status === "inactive") return "Worth checking in";
    return null;
}

// ── Hero geometry ──────────────────────────────────────────────────────────
const HERO_H = Math.round(SH * 0.44);
const ORB_SZ = 58;
const CX     = SW / 2;

// ── Atmosphere breathe — the whole field softly expands ──────────────────
function AtmosphereBreathe() {
    const breathe = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(breathe, { toValue:1, duration:12000, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
            Animated.timing(breathe, { toValue:0, duration:12000, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
        ])).start();
    }, []);
    const op = breathe.interpolate({ inputRange:[0,1], outputRange:[0.0, 0.06] });
    const sc = breathe.interpolate({ inputRange:[0,1], outputRange:[1.0, 1.06] });
    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position:"absolute",
                left: CX - SW * 0.33,
                top: HERO_H * 0.18,
                width: SW * 0.66,
                height: SW * 0.66,
                borderRadius:SW/2,
                backgroundColor:"#f59e0b",
                opacity:op, transform:[{scale:sc}],
            }}
        />
    );
}

// ── Orb ───────────────────────────────────────────────────────────────────
function Orb({ pin, x, y, i, selected, onPress }: {
    pin: ResolvedPin; x: number; y: number; i: number;
    selected: boolean; onPress: () => void;
}) {
    const pulse = useRef(new Animated.Value(0)).current;
    const color = STATUS_PIN_COLOR[pin.status] ?? "#9ca3af";
    const T     = 3200 + i * 400;

    useEffect(() => {
        const a = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue:1, duration:T, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
            Animated.timing(pulse, { toValue:0, duration:T, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
        ]));
        a.start();
        return () => a.stop();
    }, [T]);

    const ringScale = pulse.interpolate({ inputRange:[0,1], outputRange:[1, 1.28] });
    const ringOp    = pulse.interpolate({ inputRange:[0,1], outputRange:[0.45, 0.0] });
    const TAP = ORB_SZ + 36;

    return (
        <Pressable
            onPress={onPress}
            hitSlop={12}
            style={{
                position:"absolute",
                left: x - TAP/2, top: y - TAP/2,
                width:TAP, height:TAP,
                alignItems:"center", justifyContent:"center",
            }}
        >
            {/* Name pill — clean white, above orb */}
            <View style={{
                position:"absolute",
                top: TAP/2 - ORB_SZ/2 - 30,
                flexDirection:"row", alignItems:"center", gap:5,
                paddingHorizontal:10, paddingVertical:4,
                borderRadius:20,
                backgroundColor:"rgba(255,255,255,0.95)",
                shadowColor:"#000", shadowOffset:{width:0,height:2},
                shadowOpacity:0.16, shadowRadius:5, elevation:3,
                alignSelf:"center",
            }}>
                <View style={{ width:7, height:7, borderRadius:3.5, flexShrink:0, backgroundColor:color }} />
                <Text style={{ fontSize:11, fontFamily:"Inter_600SemiBold", color:"#1a1a1a", flexShrink:1 }}>
                    {pin.name}
                </Text>
            </View>

            {/* Pulsing ring — border only, breathes outward */}
            <Animated.View style={{
                position:"absolute",
                width:ORB_SZ+6, height:ORB_SZ+6,
                borderRadius:(ORB_SZ+6)/2,
                borderWidth:1.8, borderColor:color,
                opacity:ringOp,
                transform:[{scale:ringScale}],
            }} />

            {/* Orb: status ring + token + heavy frost */}
            <View style={{
                borderRadius:ORB_SZ/2+3,
                borderWidth:selected ? 2.2 : 1.6,
                borderColor:color,
                opacity:pin.status==="inactive" ? 0.50 : 1,
                overflow:"hidden",
            }}>
                <PresenceToken relation={pin.relation} pinColor={color} size={ORB_SZ} showRing={false} />
                {/* Heavy frost — kills face recognition, keeps warm presence */}
                <View style={{
                    ...StyleSheet.absoluteFillObject,
                    backgroundColor:"rgba(255,248,235,0.58)",
                }} />
                {/* Centre softener — removes eye/nose contrast */}
                <View style={{
                    position:"absolute",
                    top:"18%", left:"18%", right:"18%", bottom:"18%",
                    borderRadius:ORB_SZ,
                    backgroundColor:"rgba(255,252,242,0.32)",
                }} />
            </View>
        </Pressable>
    );
}

// ── Connection thread ──────────────────────────────────────────────────────
function Threads({ positions, pins }: {
    positions:{x:number;y:number}[];
    pins:ResolvedPin[];
}) {
    if (positions.length < 2) return null;
    return (
        <Svg width={SW} height={HERO_H} style={StyleSheet.absoluteFill} pointerEvents="none">
            {positions.map((a, ai) =>
                positions.slice(ai+1).map((b, bi) => {
                    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2 - 24;
                    const d  = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
                    return (
                        <React.Fragment key={`${ai}_${bi}`}>
                            {/* Whisper glow — almost invisible */}
                            <Path d={d} fill="none" stroke="#f59e0b" strokeWidth={18} strokeOpacity={0.028} />
                            <Path d={d} fill="none" stroke="#fbbf24" strokeWidth={6}  strokeOpacity={0.048} />
                            {/* Thread — felt, not seen */}
                            <Path d={d} fill="none" stroke="#fcd34d" strokeWidth={1.0} strokeOpacity={0.28} />
                        </React.Fragment>
                    );
                })
            )}
        </Svg>
    );
}

// ── Member card ────────────────────────────────────────────────────────────
const CARD_W = SW - 40;
const STAR_CARD: [number,number][] = [
    [0.12,0.10],[0.78,0.07],[0.88,0.22],[0.35,0.06],[0.62,0.15],[0.50,0.28],[0.20,0.32],
];

function MemberCard({ pin, nearbyRisk, selected, onPress }: {
    pin:ResolvedPin; nearbyRisk:"high"|"medium"|null; selected:boolean; onPress:()=>void;
}) {
    const { phase, localTime } = getPhase(pin.lng);
    const theme  = CARD_BG[phase];
    const color  = STATUS_PIN_COLOR[pin.status] ?? "#9ca3af";
    const badge  = quietBadge(pin);
    const check = nearbyRisk === "high"   ? "⚠ Something nearby worth checking"
        : nearbyRisk === "medium" ? "Something nearby to stay aware of"
            : statusLabel(pin);
    const isOvd  = pin.status === "away" || pin.status === "inactive";

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [{
                width:CARD_W, height:220, borderRadius:22,
                backgroundColor:theme.bg, overflow:"hidden",
                borderWidth:selected ? 2 : 1.5,
                borderColor:selected ? color : "rgba(255,255,255,0.10)",
                shadowColor:"#000", shadowOffset:{width:0,height:6},
                shadowOpacity:0.30, shadowRadius:14,
                elevation:8, marginHorizontal:2, padding:18,
            }, pressed && { opacity:0.92, transform:[{scale:0.985}] }]}
        >
            {/* Stars */}
            {theme.stars && STAR_CARD.map(([lx,ly],si) => (
                <View key={si} style={{
                    position:"absolute", left:lx*CARD_W, top:ly*220,
                    width:si%2===0?2.5:1.5, height:si%2===0?2.5:1.5,
                    borderRadius:2, backgroundColor:"#ffffff",
                    opacity:0.30+(si%3)*0.18,
                }} />
            ))}

            {/* Moon with crescent */}
            {theme.moon && (
                <View style={{
                    position:"absolute", top:14, right:16,
                    width:40, height:40, borderRadius:20,
                    backgroundColor:"#ddd8c0",
                    shadowColor:"#ddd8c0", shadowOffset:{width:0,height:0},
                    shadowOpacity:0.55, shadowRadius:12, overflow:"hidden",
                }}>
                    <View style={{
                        position:"absolute", top:-4, left:8,
                        width:40, height:40, borderRadius:20,
                        backgroundColor:theme.bg,
                    }} />
                </View>
            )}

            {/* Sun */}
            {theme.sun && (
                <View style={{
                    position:"absolute", top:10, right:14,
                    width:48, height:48, borderRadius:24,
                    backgroundColor:theme.sunColor,
                    shadowColor:theme.sunColor, shadowOffset:{width:0,height:0},
                    shadowOpacity:0.9, shadowRadius:20, elevation:5,
                }} />
            )}

            {/* Top row: phase + soft status badge */}
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <View style={{ paddingHorizontal:9, paddingVertical:4, borderRadius:8, backgroundColor:"rgba(0,0,0,0.30)" }}>
                    <Text style={{ fontSize:10, fontFamily:"Inter_600SemiBold", color:theme.labelColor, letterSpacing:0.6 }}>
                        {theme.label}
                    </Text>
                </View>
                {badge && (
                    <View style={{ paddingHorizontal:9, paddingVertical:4, borderRadius:8, backgroundColor:"rgba(0,0,0,0.30)" }}>
                        <Text style={{ fontSize:10, fontFamily:"Inter_500Medium", color:"#fcd34d", letterSpacing:0.3 }}>{badge}</Text>
                    </View>
                )}
            </View>

            {/* PresenceToken + name (replaces letter avatar) */}
            <View style={{ flexDirection:"row", alignItems:"center", gap:14, marginBottom:"auto" as any }}>
                <View style={{ overflow:"hidden", borderRadius:22, borderWidth:1.5, borderColor:color+"88" }}>
                    {pin.avatarUrl ? (
                        <Image source={{ uri: pin.avatarUrl }} style={{ width:44, height:44, borderRadius:22 }} />
                    ) : (
                        <>
                            <PresenceToken relation={pin.relation} pinColor={color} size={44} showRing={false} />
                            {/* Soft frost on card token too — consistent feel */}
                            <View style={{
                                ...StyleSheet.absoluteFillObject,
                                backgroundColor:"rgba(255,248,235,0.40)",
                            }} />
                        </>
                    )}
                </View>
                <View style={{ flex:1 }}>
                    <Text style={{ fontSize:26, fontFamily:"Inter_700Bold", color:theme.text, letterSpacing:-0.5 }}>
                        {pin.name}
                    </Text>
                    <Text style={{ fontSize:13, fontFamily:"Inter_400Regular", color:theme.dim, marginTop:1 }}>
                        {pin.relation} · {pin.region.split(",")[0]}
                    </Text>
                </View>
            </View>

            {/* Time + emotional status pill */}
            <View style={{
                flexDirection:"row", alignItems:"center", gap:10,
                paddingHorizontal:14, paddingVertical:10,
                borderRadius:12, backgroundColor:theme.pill, marginTop:14,
            }}>
                <View style={{ width:8, height:8, borderRadius:4, backgroundColor:color }} />
                <Text style={{ fontSize:18, fontFamily:"Inter_700Bold", color:theme.text }}>{localTime}</Text>
                <View style={{ width:1, height:18, backgroundColor:"rgba(255,255,255,0.18)" }} />
                <Text style={{
                    fontSize:12, fontFamily:"Inter_500Medium",
                    color: nearbyRisk==="high" ? "#fca5a5"
                        : nearbyRisk ? "#fcd34d"
                            : isOvd ? "#fcd34d" : theme.dim,
                }} numberOfLines={1}>{check}</Text>
            </View>
        </Pressable>
    );
}

// ── Main screen ────────────────────────────────────────────────────────────
export function FamilyCircleScreen({ members, meRegion, events=[], onInvite, onMemberPress }: Props) {
    const insets    = useSafeAreaInsets();
    const [selId,   setSel]     = useState<string|null>(null);
    const panelY    = useRef(new Animated.Value(600)).current;
    const panelOp   = useRef(new Animated.Value(0)).current;
    const bdOp      = useRef(new Animated.Value(0)).current;

    const pins   = useMemo(() => resolveMembers(members, meRegion), [members, meRegion]);
    // TODO show why the pending member shows twice
    const pendingMembers = useMemo(() => members.filter(m => m.pending && !m.isMe), [members]);
    const selPin = pins.find(p => p.id === selId) ?? null;
    const hasAlert = events.some(e => e.severity === "high");
    const { text: subText, color: subColor } = heroSubtext(pins, hasAlert);

    // Sky follows the user's local time of day. The full-screen background is
    // rendered once in the tabs layout; here we only need the phase for the
    // header copy (mood + emoji).
    const phase = usePhase(meRegion);
    const sky = SKY[phase];

    const openSheet = useCallback((pin: ResolvedPin) => {
        setSel(pin.id);
        Animated.parallel([
            Animated.spring(panelY,  { toValue:0, useNativeDriver:true, bounciness:4, speed:14 }),
            Animated.timing(panelOp, { toValue:1, duration:180, useNativeDriver:true }),
            Animated.timing(bdOp,    { toValue:1, duration:180, useNativeDriver:true }),
        ]).start();
    }, [panelY, panelOp, bdOp]);

    const closeSheet = useCallback(() => {
        Animated.parallel([
            Animated.timing(panelY,  { toValue:600, duration:260, useNativeDriver:true, easing:Easing.out(Easing.cubic) }),
            Animated.timing(panelOp, { toValue:0, duration:180, useNativeDriver:true }),
            Animated.timing(bdOp,    { toValue:0, duration:180, useNativeDriver:true }),
        ]).start();
    }, [panelY, panelOp, bdOp]);

    const worstNearbyFor = useCallback((pin: ResolvedPin): "high" | "medium" | null => {
        const evs = events.filter(e => e.sentence && !!pin.name && e.sentence.includes(pin.name));
        if (evs.some(e => e.severity === "high"))   return "high";
        if (evs.some(e => e.severity === "medium")) return "medium";
        return null;
    }, [events]);

    return (
        <View style={{ flex:1 }}>

            {/* Background sky is provided by the tabs layout (shared across screens) */}

            {/* Header */}
            <View
                style={{ paddingTop:insets.top+10, paddingHorizontal:22, paddingBottom:8, flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between" }}
            >
                <View style={{ flex:1 }}>
                    <Text style={{ fontSize:28, fontFamily:"Inter_700Bold", color:"#ffffff", letterSpacing:-0.5 }}>
                        Family Circle
                    </Text>
                    {/* Emotional subtext — not a metric */}
                    <Text style={{ fontSize:13, fontFamily:"Inter_500Medium", color:subColor, marginTop:3 }}>
                        {subText}
                    </Text>
                    {/* Your sky, right now */}
                    <View style={{ flexDirection:"row", alignItems:"center", gap:6, marginTop:8 }}>
                        <Text style={{ fontSize:12 }}>{PHASE_EMOJI[phase]}</Text>
                        <Text style={{ fontSize:12, fontFamily:"Inter_400Regular", color:"rgba(255,255,255,0.7)" }} numberOfLines={1}>
                            {sky.mood}
                        </Text>
                    </View>
                </View>
                <Pressable
                    onPress={onInvite}
                    style={{ width:42, height:42, borderRadius:21, backgroundColor:"rgba(245,158,11,0.18)", borderWidth:1.5, borderColor:"rgba(245,158,11,0.45)", alignItems:"center", justifyContent:"center" }}
                >
                    <Feather name="user-plus" size={18} color="#f59e0b" />
                </Pressable>
            </View>

            {/*Members cards*/}
            <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom:insets.bottom+100 }}>

                {/* Cards — stacked vertically */}
                {pins.length > 0 && (
                    <View style={{ paddingHorizontal:20, paddingTop:16, paddingBottom:6, gap:16 }}>
                        {pins.map(pin => (
                            <MemberCard
                                key={pin.id}
                                pin={pin}
                                nearbyRisk={worstNearbyFor(pin)}
                                selected={selId===pin.id}
                                onPress={() => openSheet(pin)}
                            />
                        ))}
                    </View>
                )}

                {/* Pending invites — so the circle never looks empty while waiting */}
                {pendingMembers.length > 0 && (
                    <View style={{ paddingHorizontal:20, paddingTop: pins.length>0?6:16, gap:12 }}>
                        {pins.length === 0 && (
                            <Text style={{ fontSize:13, fontFamily:"Inter_600SemiBold", color:"rgba(255,255,255,0.7)", letterSpacing:0.3, marginBottom:2 }}>
                                Waiting to connect
                            </Text>
                        )}
                        {pendingMembers.map(m => (
                            <Pressable key={m.id} onPress={onInvite} style={{
                                flexDirection:"row", alignItems:"center", gap:14,
                                backgroundColor:"#FFFFFF", borderRadius:18, padding:16,
                                borderWidth:1, borderColor:"#F0E8D8",
                                shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:2,
                            }}>
                                <View style={{ width:48, height:48, borderRadius:24, backgroundColor:"#F0E2C4", borderWidth:1.5, borderColor:"#E0CFA8", alignItems:"center", justifyContent:"center" }}>
                                    <Text style={{ fontSize:18, fontFamily:"Inter_700Bold", color:"#9C7B2E" }}>{m.name[0]?.toUpperCase() ?? "?"}</Text>
                                </View>
                                <View style={{ flex:1 }}>
                                    <Text style={{ fontSize:16, fontFamily:"Inter_600SemiBold", color:"#1C1410" }}>{m.name}</Text>
                                    <View style={{ flexDirection:"row", alignItems:"center", gap:6, marginTop:3 }}>
                                        <View style={{ width:6, height:6, borderRadius:3, backgroundColor:"#f59e0b" }} />
                                        <Text style={{ fontSize:12.5, fontFamily:"Inter_500Medium", color:"#9C8E7A" }}>Invitation sent · waiting to connect</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:12, paddingVertical:8, borderRadius:12, backgroundColor:"rgba(245,158,11,0.12)" }}>
                                    <Feather name="share-2" size={13} color="#c97d0a" />
                                    <Text style={{ fontSize:13, fontFamily:"Inter_600SemiBold", color:"#c97d0a" }}>Remind</Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                )}

                {/* Empty state — never a blank globe */}
                {pins.length === 0 && pendingMembers.length === 0 && (
                    <View style={{ paddingHorizontal:20, paddingTop:24, alignItems:"center" }}>
                        <View style={{ backgroundColor:"#FFFFFF", borderRadius:20, padding:24, alignItems:"center", borderWidth:1, borderColor:"#F0E8D8", width:"100%" }}>
                            <View style={{ width:60, height:60, borderRadius:30, backgroundColor:"rgba(245,158,11,0.12)", alignItems:"center", justifyContent:"center", marginBottom:14 }}>
                                <Feather name="user-plus" size={26} color="#c97d0a" />
                            </View>
                            <Text style={{ fontSize:18, fontFamily:"Inter_700Bold", color:"#1C1410", marginBottom:6 }}>Your circle starts here</Text>
                            <Text style={{ fontSize:14, fontFamily:"Inter_400Regular", color:"#6B5C46", textAlign:"center", lineHeight:20, marginBottom:18 }}>
                                Invite someone you care about. You'll quietly see when they're okay — no constant check-ins.
                            </Text>
                            <Pressable onPress={onInvite} style={{ flexDirection:"row", alignItems:"center", gap:8, backgroundColor:"#f59e0b", paddingHorizontal:22, paddingVertical:13, borderRadius:14 }}>
                                <Feather name="user-plus" size={16} color="#fff" />
                                <Text style={{ fontSize:15, fontFamily:"Inter_600SemiBold", color:"#fff" }}>Invite someone</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                {/* Events — SAIAE verified calm cards */}
                {events.length > 0 && (
                    <View style={{ paddingHorizontal:20, marginTop:10, marginBottom:8 }}>
                            <View style={{ flexDirection:"row", alignItems:"center", gap:6, marginBottom:12 }}>
                                <Feather name="shield" size={14} color={hasAlert ? "#ef4444" : "#b45309"} />
                                <Text style={{ fontSize:14, fontFamily:"Inter_600SemiBold", color:hasAlert ? "#ef4444" : "#b45309" }}>
                                    {events.length} {events.length===1?"update":"updates"} for your circle
                                </Text>
                            </View>
                            {events.map(ev => {
                                const isH=ev.severity==="high", isM=ev.severity==="medium";
                                const ec=isH?"#ef4444":isM?"#f59e0b":"#5cb887";
                                const riskWord = isH?"Important":isM?"Stay aware":"Calm";
                                return (
                                    <View key={ev.id} style={{
                                        flexDirection:"row", alignItems:"flex-start", gap:12,
                                        backgroundColor:"#FFFFFF", borderRadius:16, padding:14,
                                        marginBottom:10, borderWidth:1, borderColor:"#F0E8D8",
                                        shadowColor:"#000", shadowOffset:{width:0,height:1},
                                        shadowOpacity:0.06, shadowRadius:6, elevation:2,
                                    }}>
                                        <View style={{ width:40,height:40,borderRadius:12,backgroundColor:ec+"18",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                                            <Text style={{fontSize:16}}>{ev.icon}</Text>
                                        </View>
                                        <View style={{ flex:1 }}>
                                            {/* Backend's vetted calm sentence — not a raw headline */}
                                            <Text style={{ fontSize:14,fontFamily:"Inter_500Medium",color:"#1C1410",marginBottom:6,lineHeight:20 }} numberOfLines={3}>
                                                {ev.sentence ?? ev.title}
                                            </Text>
                                            <View style={{ flexDirection:"row", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                                <View style={{ flexDirection:"row",alignItems:"center",gap:4,backgroundColor:"#ECFDF5",paddingHorizontal:7,paddingVertical:3,borderRadius:20,borderWidth:1,borderColor:"#A7F3D0" }}>
                                                    <Feather name="shield" size={9} color="#059669" />
                                                    <Text style={{ fontSize:11,fontFamily:"Inter_600SemiBold",color:"#059669" }}>Confirmed by {ev.source}</Text>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={{ paddingHorizontal:10,paddingVertical:5,borderRadius:20,backgroundColor:isH?"#fef2f2":isM?"#fffbeb":"#ecfdf5",flexShrink:0,alignSelf:"flex-start" }}>
                                            <Text style={{ fontSize:12,fontFamily:"Inter_600SemiBold",color:ec }}>
                                                {riskWord}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>

            {/* ══ BACKDROP ══ */}
            <Animated.View
                style={[StyleSheet.absoluteFill, { backgroundColor:"rgba(0,0,0,0.45)", opacity:bdOp, zIndex:20 }]}
                pointerEvents={selPin ? "auto" : "none"}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
            </Animated.View>

            {/* ══ SHEET ══ */}
            <Animated.View style={{
                position:"absolute", bottom:0, left:0, right:0, zIndex:40,
                backgroundColor:"#FFF9F0", borderTopLeftRadius:28, borderTopRightRadius:28,
                paddingTop:10, paddingHorizontal:20, paddingBottom:insets.bottom+100,
                shadowColor:"#000", shadowOffset:{width:0,height:-8},
                shadowOpacity:0.20, shadowRadius:24, elevation:20,
                transform:[{translateY:panelY}], opacity:panelOp,
            }}>
                {selPin && (() => {
                    const { phase, localTime } = getPhase(selPin.lng);
                    const theme  = CARD_BG[phase];
                    const color  = STATUS_PIN_COLOR[selPin.status] ?? "#9ca3af";
                    const isOvd  = selPin.status==="away"||selPin.status==="inactive";
                    // Prefer the backend's vetted calm sentence for THIS person (the
                    // SAIAE sentence names them); fall back to a calm default otherwise.
                    const pinEvs = events.filter(e => !e.sentence || (!!selPin.name && e.sentence.includes(selPin.name)));
                    const worstNearby = pinEvs.some(e => e.severity === "high")   ? "high"
                        : pinEvs.some(e => e.severity === "medium") ? "medium"
                            : null;
                    const memberAlert = events.find(e => e.sentence && !!selPin.name && e.sentence.includes(selPin.name));
                    const olliaNote = memberAlert?.sentence ?? (isOvd
                        ? `Ollia hasn't noticed anything unusual near ${selPin.region.split(",")[0]}. Things seem calm.`
                        : `${selPin.name}'s area is quiet right now. Nothing unusual nearby.`);
                    return (
                        <>
                            <View style={{ width:38,height:4,borderRadius:2,backgroundColor:"#E0D0B8",alignSelf:"center",marginBottom:18 }} />
                            <Pressable
                                style={{ position:"absolute",top:14,right:18,width:30,height:30,borderRadius:15,backgroundColor:"#EAD9C0cc",alignItems:"center",justifyContent:"center" }}
                                onPress={closeSheet} hitSlop={10}
                            >
                                <Feather name="x" size={15} color="#6B5C46" />
                            </Pressable>

                            {/* Mini sky card header */}
                            <View style={{ flexDirection:"row",alignItems:"center",gap:14,padding:16,borderRadius:18,backgroundColor:theme.bg,marginBottom:16 }}>
                                <View style={{ overflow:"hidden", borderRadius:28, borderWidth:1.5, borderColor:color+"88" }}>
                                    {selPin.avatarUrl ? (
                                        <Image source={{ uri: selPin.avatarUrl }} style={{ width:52, height:52, borderRadius:26 }} />
                                    ) : (
                                        <>
                                            <PresenceToken relation={selPin.relation} pinColor={color} size={52} showRing={false} />
                                            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor:"rgba(255,248,235,0.42)" }} />
                                        </>
                                    )}
                                </View>
                                <View style={{ flex:1 }}>
                                    <Text style={{ fontSize:18,fontFamily:"Inter_700Bold",color:theme.text }}>{selPin.name}</Text>
                                    <Text style={{ fontSize:13,fontFamily:"Inter_400Regular",color:theme.dim,marginTop:2 }}>
                                        {selPin.relation} · {selPin.region.split(",")[0]}
                                    </Text>
                                </View>
                                <View style={{ flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:10,paddingVertical:7,borderRadius:20,backgroundColor:"rgba(0,0,0,0.32)" }}>
                                    <View style={{ width:6,height:6,borderRadius:3,backgroundColor:color }} />
                                    <Text style={{ fontSize:14,fontFamily:"Inter_700Bold",color:theme.text }}>{localTime}</Text>
                                </View>
                            </View>

                            {/* Meta — warm, not operational */}
                            <View style={{ flexDirection:"row",flexWrap:"wrap",gap:10,marginBottom:14 }}>
                                {([
                                    { icon:"clock",       label:"Last seen",  val:formatLastSeen(selPin.lastSeen),      col:undefined },
                                    { icon:"check-circle",label:"Check-in",   val:formatLastSeen(selPin.lastCheckInAt), col:undefined },
                                    {
                                        icon:"shield", label:"Nearby", val: worstNearby==="high"   ? "Worth checking"
                                            : worstNearby==="medium" ? "Stay aware" : "All quiet",
                                        col: worstNearby==="high"   ? "#ef4444"
                                            : worstNearby==="medium" ? "#f59e0b" : "#10b981"
                                    },
                                    { icon:"map-pin",     label:"Feeling",    val:isOvd?"Worth checking in":"Settled",  col:isOvd?"#f59e0b":"#10b981" },
                                ] as const).map(({ icon, label, val, col }) => (
                                    <View key={label} style={{ flex:1,minWidth:"44%",backgroundColor:"#F7F0E6",borderRadius:14,padding:12,gap:4,borderWidth:1,borderColor:"#EAD9C0" }}>
                                        <Feather name={icon as any} size={13} color="#9C8E7A" />
                                        <Text style={{ fontSize:10,fontFamily:"Inter_500Medium",color:"#9C8E7A",textTransform:"uppercase",letterSpacing:0.5 }}>{label}</Text>
                                        <Text style={{ fontSize:13,fontFamily:"Inter_600SemiBold",color:col??"#1C1410" }}>{val}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Ollia note */}
                            <View style={{ backgroundColor:"rgba(245,158,11,0.07)", borderRadius:14, padding:14, marginBottom:14, borderWidth:1, borderColor:"rgba(245,158,11,0.18)" }}>
                                <Text style={{ fontSize:13, fontFamily:"Inter_400Regular", color:"#6B5C46", lineHeight:20 }}>
                                    <Text style={{ fontFamily:"Inter_600SemiBold", color:"#c97d0a" }}>Ollia  </Text>
                                    {olliaNote}
                                </Text>
                            </View>

                            {/* Member events */}
                            {pinEvs.length > 0 && (
                                <View style={{ marginBottom:14 }}>
                                    <View style={{ flexDirection:"row",alignItems:"center",gap:6,marginBottom:8 }}>
                                        <Feather name="alert-triangle" size={12} color="#ef4444" />
                                        <Text style={{ fontSize:12,fontFamily:"Inter_600SemiBold",color:"#ef4444" }}>
                                            {pinEvs.length} {pinEvs.length===1?"alert":"alerts"} near {selPin.region.split(",")[0]}
                                        </Text>
                                    </View>
                                    {pinEvs.map(ev => {
                                        const ec=ev.severity==="high"?"#ef4444":ev.severity==="medium"?"#f59e0b":"#9ca3af";
                                        return (
                                            <View key={ev.id} style={{ flexDirection:"row",alignItems:"center",gap:10,padding:12,borderRadius:12,borderWidth:1,borderColor:ec+"28",backgroundColor:ec+"06",marginBottom:8 }}>
                                                <Text style={{fontSize:14}}>{ev.icon}</Text>
                                                <View style={{flex:1}}>
                                                    <Text style={{fontSize:12,fontFamily:"Inter_600SemiBold",color:ec,marginBottom:3}} numberOfLines={1}>{ev.title}</Text>
                                                    <View style={{flexDirection:"row",alignItems:"center",gap:4,backgroundColor:"#ECFDF5",paddingHorizontal:6,paddingVertical:2,borderRadius:20,borderWidth:1,borderColor:"#A7F3D0",alignSelf:"flex-start"}}>
                                                        <Feather name="shield" size={9} color="#059669" />
                                                        <Text style={{fontSize:10,fontFamily:"Inter_600SemiBold",color:"#059669"}}>{ev.source} Verified</Text>
                                                    </View>
                                                </View>
                                                <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:20,backgroundColor:ec+"18"}}>
                                                    <Text style={{fontSize:10,fontFamily:"Inter_600SemiBold",color:ec}}>{ev.severity.charAt(0).toUpperCase()+ev.severity.slice(1)}</Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            <Pressable
                                style={({ pressed }) => [{
                                    flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,
                                    backgroundColor:"#f59e0b",borderRadius:16,paddingVertical:15,
                                }, pressed && { opacity:0.82 }]}
                                onPress={() => { closeSheet(); onMemberPress?.(selPin.id); }}
                            >
                                <Text style={{ fontSize:15,fontFamily:"Inter_600SemiBold",color:"#fff" }}>View full profile</Text>
                                <Feather name="arrow-right" size={15} color="#fff" />
                            </Pressable>
                        </>
                    );
                })()}
            </Animated.View>
        </View>
    );
}