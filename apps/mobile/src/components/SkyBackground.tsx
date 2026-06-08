/**
 * Shared time-of-day sky — a single full-screen background used across the app.
 *
 * The sky reflects the user's *local* time of day (resolved from their region,
 * falling back to the device timezone) and always resolves into the cream
 * navbar tone at the very bottom, so there is never a hard seam at the tab bar.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet } from "react-native";
import Svg, {
    Defs, RadialGradient, LinearGradient as SvgLinearGradient,
    Stop, Circle as SvgCircle, Rect,
} from "react-native-svg";
import BRAND from "@/constants/colors";
import { resolveCoords } from "./FamilyGlobe/globeUtils";

const { width: SW, height: SH } = Dimensions.get("window");

// ── Time of day ─────────────────────────────────────────────────────────────
export type Phase = "latenight"|"night"|"dawn"|"morning"|"day"|"golden"|"dusk";

export function getPhase(lng: number): { phase: Phase; localTime: string; hour: number } {
    const local = new Date(Date.now() + (lng / 15) * 3_600_000);
    const h = local.getUTCHours() + local.getUTCMinutes() / 60;
    const time = local.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC",
    });
    const phase: Phase =
        h < 4  ? "latenight" : h < 6  ? "dawn"    :
            h < 9  ? "morning"   : h < 17 ? "day"      :
                h < 19 ? "golden"    : h < 21 ? "dusk"     : "night";
    return { phase, localTime: time, hour: h };
}

/** Resolve the user's local sky phase from a region string. */
export function usePhase(region?: string): Phase {
    return useMemo(() => {
        const coords = region ? resolveCoords(region) : null;
        const lng = coords ? coords[1] : -new Date().getTimezoneOffset() / 4;
        return getPhase(lng).phase;
    }, [region]);
}

// ── Sky palettes ──────────────────────────────────────────────────────────
const CREAM = BRAND.background;   // #F0E2C4 — the navbar / app base

export type SkyTheme = {
    stops:    [number, string][];   // top → bottom, last stop === CREAM
    glow:     string;  glowOp: number;          // ambient zenith haze
    star:     number;                           // 0 = no stars … 1 = full
    starTint: string;
    body:     "sun" | "moon" | "none";
    bodyColor:string;  bodyGlow:string;
    bodyX:    number;  bodyY:  number;           // fraction of SW / SH
    mood:     string;                            // emotional one-liner
};

export const SKY: Record<Phase, SkyTheme> = {
    latenight: {
        stops: [[0,"#060418"],[0.34,"#100d33"],[0.58,"#1c1842"],[0.76,"#352a55"],[0.88,"#7d6478"],[0.95,"#d8c2a0"],[1,CREAM]],
        glow:"#3a2d6b", glowOp:0.5,  star:1,    starTint:"#dfe6ff",
        body:"none", bodyColor:"#ece9dc", bodyGlow:"#cfcae0", bodyX:0.74, bodyY:0.15,
        mood:"The world is sleeping",
    },
    night: {
        stops: [[0,"#08102e"],[0.34,"#112049"],[0.58,"#1e3060"],[0.76,"#3a4570"],[0.88,"#7e6f80"],[0.95,"#d8c2a2"],[1,CREAM]],
        glow:"#2a4a8c", glowOp:0.42, star:0.92, starTint:"#dbe6ff",
        body:"none", bodyColor:"#f2efe2", bodyGlow:"#bcd0f0", bodyX:0.72, bodyY:0.14,
        mood:"A quiet night together",
    },
    dawn: {
        stops: [[0,"#191447"],[0.32,"#3e2a60"],[0.55,"#7c3a6e"],[0.74,"#c25a6a"],[0.86,"#ef9a72"],[0.95,"#f2cf9e"],[1,CREAM]],
        glow:"#e87a8a", glowOp:0.30, star:0.3,  starTint:"#ffe0ec",
        body:"sun", bodyColor:"#ffd9a8", bodyGlow:"#f6a07a", bodyX:0.5, bodyY:0.30,
        mood:"A new day is breaking",
    },
    morning: {
        stops: [[0,"#2f63ac"],[0.34,"#5a8acc"],[0.56,"#9ac0e0"],[0.74,"#f0c088"],[0.87,"#f6dcae"],[0.95,"#f3e3c4"],[1,CREAM]],
        glow:"#ffd9a0", glowOp:0.26, star:0,    starTint:"#ffffff",
        body:"sun", bodyColor:"#fff3cf", bodyGlow:"#ffe49a", bodyX:0.7, bodyY:0.19,
        mood:"Morning light is here",
    },
    day: {
        stops: [[0,"#2f74c8"],[0.34,"#4f97d8"],[0.6,"#86bce8"],[0.8,"#bcdcf0"],[0.9,"#dfe7df"],[0.96,"#ece2cc"],[1,CREAM]],
        glow:"#dcebf6", glowOp:0.24, star:0,    starTint:"#ffffff",
        body:"sun", bodyColor:"#fffbe6", bodyGlow:"#fff0b0", bodyX:0.72, bodyY:0.15,
        mood:"A bright, open day",
    },
    golden: {
        stops: [[0,"#1f3f72"],[0.32,"#7a4a72"],[0.54,"#c4683a"],[0.73,"#f0913e"],[0.86,"#ffc266"],[0.95,"#f4dca6"],[1,CREAM]],
        glow:"#ff9a40", glowOp:0.34, star:0.12, starTint:"#ffe9c0",
        body:"sun", bodyColor:"#ffcf6a", bodyGlow:"#ff9a3a", bodyX:0.3, bodyY:0.34,
        mood:"Golden hour",
    },
    dusk: {
        stops: [[0,"#17143f"],[0.32,"#3e2360"],[0.54,"#6e2c6e"],[0.73,"#b04a78"],[0.85,"#e58a76"],[0.94,"#eac49e"],[1,CREAM]],
        glow:"#a44a8c", glowOp:0.34, star:0.55, starTint:"#ffd9ec",
        body:"sun", bodyColor:"#ffb070", bodyGlow:"#d96a5a", bodyX:0.5, bodyY:0.32,
        mood:"The day is winding down",
    },
};

export const PHASE_EMOJI: Record<Phase, string> = {
    latenight:"🌙", night:"🌙", dawn:"🌅", morning:"🌤️", day:"☀️", golden:"🌇", dusk:"🌆",
};

// lx, ly, size, baseOpacity — clustered in the upper ⅔ so the bottom stays clean
const STAR_DATA: [number,number,number,number][] = [
    [0.08,0.10,1.8,0.55],[0.22,0.05,1.2,0.35],[0.38,0.03,2.2,0.62],
    [0.55,0.08,1.4,0.38],[0.72,0.04,1.8,0.50],[0.88,0.12,1.2,0.30],
    [0.94,0.26,2.0,0.55],[0.84,0.48,1.4,0.35],[0.90,0.60,1.6,0.40],
    [0.18,0.64,1.4,0.32],[0.06,0.52,1.0,0.22],[0.02,0.36,2.2,0.48],
    [0.12,0.22,1.4,0.32],[0.48,0.13,1.0,0.25],[0.66,0.26,1.6,0.42],
    [0.44,0.45,1.2,0.30],[0.78,0.39,1.8,0.46],[0.30,0.19,1.6,0.42],
    [0.62,0.40,1.2,0.34],[0.34,0.33,2.0,0.50],[0.50,0.29,1.0,0.28],
    [0.16,0.41,1.4,0.36],[0.70,0.15,1.2,0.30],[0.26,0.49,1.8,0.44],
    [0.58,0.53,1.4,0.34],[0.10,0.31,2.2,0.52],[0.82,0.29,1.0,0.26],
    [0.40,0.07,1.6,0.40],[0.92,0.44,1.4,0.34],[0.24,0.11,1.2,0.30],
    [0.52,0.20,1.4,0.36],[0.36,0.56,1.2,0.28],[0.74,0.56,1.0,0.24],
    [0.46,0.62,1.6,0.34],[0.04,0.18,1.2,0.30],[0.98,0.16,1.4,0.34],
    // denser second layer — fine dust
    [0.14,0.07,1.0,0.22],[0.28,0.28,1.0,0.24],[0.42,0.22,0.9,0.20],
    [0.56,0.17,1.1,0.26],[0.68,0.34,1.0,0.22],[0.80,0.21,0.9,0.20],
    [0.20,0.36,1.1,0.26],[0.32,0.45,0.9,0.20],[0.48,0.38,1.0,0.24],
    [0.64,0.50,1.1,0.24],[0.76,0.48,0.9,0.18],[0.88,0.36,1.0,0.22],
    [0.06,0.44,1.0,0.22],[0.96,0.34,0.9,0.18],[0.18,0.54,1.1,0.24],
    [0.38,0.60,0.9,0.18],[0.54,0.44,1.0,0.22],[0.72,0.62,0.9,0.18],
    [0.86,0.54,1.0,0.20],[0.30,0.09,0.9,0.20],[0.60,0.10,1.1,0.26],
    [0.50,0.58,0.9,0.18],[0.12,0.60,1.0,0.20],[0.78,0.10,1.0,0.24],
];

// ── Drifting star — gentle float + de-synced twinkle ─────────────────────────
function DriftingStar({ lx, ly, sz, op, color, period, dx, dy }: {
    lx:number; ly:number; sz:number; op:number; color:string;
    period:number; dx:number; dy:number;
}) {
    const anim = useRef(new Animated.Value(0)).current;
    const tw   = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(anim, { toValue:1, duration:period, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
            Animated.timing(anim, { toValue:0, duration:period, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
        ])).start();
        const twP = 1600 + (period % 2400);
        Animated.loop(Animated.sequence([
            Animated.timing(tw, { toValue:1, duration:twP, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
            Animated.timing(tw, { toValue:0, duration:twP, useNativeDriver:true, easing:Easing.inOut(Easing.sin) }),
        ])).start();
    }, []);
    const tx = anim.interpolate({ inputRange:[0,1], outputRange:[0, dx] });
    const ty = anim.interpolate({ inputRange:[0,1], outputRange:[0, dy] });
    const opacity = tw.interpolate({ inputRange:[0,1], outputRange:[op*0.3, op] });
    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position:"absolute",
                left:lx*SW - sz/2, top:ly*SH - sz/2,
                width:sz, height:sz, borderRadius:sz/2,
                backgroundColor:color, opacity,
                shadowColor:color, shadowOpacity:0.9,
                shadowRadius:sz*1.6, shadowOffset:{ width:0, height:0 },
                transform:[{translateX:tx},{translateY:ty}],
            }}
        />
    );
}

// ── Full-screen sky for the user's local time of day ────────────────────────
export function SkyBackground({ phase }: { phase: Phase }) {
    const sky = SKY[phase];
    const bx  = sky.bodyX * SW, by = sky.bodyY * SH;
    return (
        <>
            <Svg width={SW} height={SH} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                    <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                        {sky.stops.map(([o,c],i) => <Stop key={i} offset={o} stopColor={c} />)}
                    </SvgLinearGradient>
                    <RadialGradient id="ambient" cx="50%" cy="24%" r="58%">
                        <Stop offset="0%"   stopColor={sky.glow} stopOpacity={sky.glowOp} />
                        <Stop offset="100%" stopColor={sky.glow} stopOpacity="0" />
                    </RadialGradient>
                    {sky.body !== "none" && (
                        <RadialGradient id="bodyglow" cx="50%" cy="50%" r="50%">
                            <Stop offset="0%"   stopColor={sky.bodyGlow} stopOpacity="0.55" />
                            <Stop offset="55%"  stopColor={sky.bodyGlow} stopOpacity="0.14" />
                            <Stop offset="100%" stopColor={sky.bodyGlow} stopOpacity="0" />
                        </RadialGradient>
                    )}
                </Defs>

                <Rect x="0" y="0" width={SW} height={SH} fill="url(#sky)" />
                <Rect x="0" y="0" width={SW} height={SH} fill="url(#ambient)" />

                {sky.body !== "none" && (
                    <>
                        <SvgCircle cx={bx} cy={by} r={130} fill="url(#bodyglow)" />
                        <SvgCircle cx={bx} cy={by} r={sky.body === "moon" ? 30 : 34} fill={sky.bodyColor} />
                        {sky.body === "moon" && (
                            <SvgCircle cx={bx + 13} cy={by - 7} r={26} fill={sky.stops[0][1]} />
                        )}
                    </>
                )}
            </Svg>

            {/* Stars — only when the sky is dark enough to hold them */}
            {sky.star > 0 && STAR_DATA.map(([lx,ly,sz,op],si) => (
                <DriftingStar key={si}
                              lx={lx} ly={ly} sz={sz} op={op * sky.star}
                              color={si%6===0 ? "#fde68a" : si%4===0 ? sky.starTint : "#ffffff"}
                              period={18000 + si*900}
                              dx={si%3===0?3:si%2===0?-2:1.5}
                              dy={si%4===0?2:si%3===0?-1.5:si%2===0?2.5:-1}
                />
            ))}
        </>
    );
}

export default SkyBackground;