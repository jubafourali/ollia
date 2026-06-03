import React from "react";
import Svg, { Circle, Path, Defs, RadialGradient, Stop, G, Line } from "react-native-svg";
import BRAND from "@/constants/colors";

/**
 * Screen 1 — Uncertainty / emotional distance.
 *
 * Two soft circles representing two people, separated by a gentle
 * curved space. The smaller circle has a quiet glow around it.
 * Editorial, calm, warm. No faces, no objects, no fear.
 */
export function UncertaintyIllustration({ size = 280 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 280 280" fill="none">
            <Defs>
                <RadialGradient id="warmGlow" cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor={BRAND.primary} stopOpacity="0.18" />
                    <Stop offset="0.6" stopColor={BRAND.primary} stopOpacity="0.06" />
                    <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="distantGlow" cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor={BRAND.textSecondary} stopOpacity="0.12" />
                    <Stop offset="1" stopColor={BRAND.textSecondary} stopOpacity="0" />
                </RadialGradient>
            </Defs>

            {/* Distant glow on far side */}
            <Circle cx="208" cy="92" r="62" fill="url(#distantGlow)" />

            {/* Distant person — smaller, fainter */}
            <Circle cx="208" cy="92" r="22" fill={BRAND.backgroundCard} />
            <Circle
                cx="208"
                cy="92"
                r="22"
                stroke={BRAND.border}
                strokeWidth="1.5"
                fill="none"
                strokeDasharray="2 4"
            />

            {/* Soft curved connection — broken / fading */}
            <Path
                d="M 85 175 Q 140 130, 188 100"
                stroke={BRAND.border}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="1 6"
                fill="none"
                opacity="0.6"
            />

            {/* Warm glow around current user */}
            <Circle cx="80" cy="186" r="82" fill="url(#warmGlow)" />

            {/* Current user — larger, warmer */}
            <Circle cx="80" cy="186" r="32" fill={BRAND.primaryLight} opacity="0.4" />
            <Circle cx="80" cy="186" r="22" fill={BRAND.primary} opacity="0.9" />

            {/* Tiny tonal accents — three sparse dots in upper-right negative space */}
            <Circle cx="245" cy="50" r="2.5" fill={BRAND.border} opacity="0.5" />
            <Circle cx="232" cy="160" r="2" fill={BRAND.border} opacity="0.4" />
            <Circle cx="38" cy="92" r="2" fill={BRAND.border} opacity="0.4" />
        </Svg>
    );
}

/**
 * Screen 2 — Reassurance without tracking.
 *
 * Two warm circles connected by gentle, abstract signal lines —
 * arcs that flow between them, not radar pings or location pins.
 * Conveys connection and quiet presence, not surveillance.
 */
export function ReassuranceIllustration({ size = 280 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 280 280" fill="none">
            <Defs>
                <RadialGradient id="leftWarm" cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor={BRAND.primary} stopOpacity="0.16" />
                    <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="rightWarm" cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor={BRAND.statusGreen} stopOpacity="0.14" />
                    <Stop offset="1" stopColor={BRAND.statusGreen} stopOpacity="0" />
                </RadialGradient>
            </Defs>

            {/* Soft glows */}
            <Circle cx="72" cy="140" r="72" fill="url(#leftWarm)" />
            <Circle cx="208" cy="140" r="72" fill="url(#rightWarm)" />

            {/* Three gentle arcs flowing between them — warmest at center */}
            <Path
                d="M 86 140 Q 140 88, 194 140"
                stroke={BRAND.primary}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.45"
            />
            <Path
                d="M 86 140 Q 140 140, 194 140"
                stroke={BRAND.primary}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.7"
            />
            <Path
                d="M 86 140 Q 140 192, 194 140"
                stroke={BRAND.primary}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.45"
            />

            {/* Tiny center dot — the "quiet signal" */}
            <Circle cx="140" cy="140" r="3.5" fill={BRAND.statusGreen} />
            <Circle cx="140" cy="140" r="9" fill={BRAND.statusGreen} opacity="0.15" />

            {/* Left person */}
            <Circle cx="72" cy="140" r="24" fill={BRAND.primaryLight} opacity="0.35" />
            <Circle cx="72" cy="140" r="16" fill={BRAND.primary} opacity="0.9" />

            {/* Right person */}
            <Circle cx="208" cy="140" r="24" fill={BRAND.statusGreenLight} opacity="0.7" />
            <Circle cx="208" cy="140" r="16" fill={BRAND.statusGreen} opacity="0.85" />

            {/* Sparse atmospheric dots */}
            <Circle cx="140" cy="68" r="2" fill={BRAND.border} opacity="0.4" />
            <Circle cx="140" cy="212" r="2" fill={BRAND.border} opacity="0.4" />
        </Svg>
    );
}