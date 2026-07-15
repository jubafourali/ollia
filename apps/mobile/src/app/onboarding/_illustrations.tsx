import React from "react";
import Svg, {
    Circle,
    Path,
    Defs,
    RadialGradient,
    LinearGradient,
    Stop,
    Ellipse,
    Rect,
    G,
} from "react-native-svg";
import BRAND from "@/constants/colors";

/**
 * Visual language: soft paper-cut / editorial.
 * Rounded silhouettes, layered atmosphere, almost no linework.
 * No node graphs, no phone UI chrome, no crossed-out pins.
 */

/** Soft frosted card behind every hero art */
function ArtBoard({ children }: { children: React.ReactNode }) {
    return (
        <G>
            <Defs>
                <LinearGradient id="art_board" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFF8EC" stopOpacity="1" />
                    <Stop offset="1" stopColor="#F3E4C4" stopOpacity="1" />
                </LinearGradient>
                <RadialGradient id="art_haze" cx="0.5" cy="0.35" r="0.7">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="280" height="280" rx="36" fill="url(#art_board)" />
            <Ellipse cx="140" cy="90" rx="120" ry="70" fill="url(#art_haze)" />
            {children}
        </G>
    );
}

/**
 * Hook — someone close, someone far.
 * Two soft human silhouettes in different scales / tones across a warm horizon.
 */
export function UncertaintyIllustration({ size = 280 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 280 280" fill="none">
            <ArtBoard>
                <Defs>
                    <RadialGradient id="unc_near" cx="0.45" cy="0.4" r="0.6">
                        <Stop offset="0" stopColor={BRAND.primary} stopOpacity="0.35" />
                        <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
                    </RadialGradient>
                    <RadialGradient id="unc_far" cx="0.5" cy="0.5" r="0.55">
                        <Stop offset="0" stopColor={BRAND.textMuted} stopOpacity="0.22" />
                        <Stop offset="1" stopColor={BRAND.textMuted} stopOpacity="0" />
                    </RadialGradient>
                    <LinearGradient id="unc_land" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#EAD7B0" stopOpacity="0" />
                        <Stop offset="1" stopColor="#DFC89A" stopOpacity="0.85" />
                    </LinearGradient>
                </Defs>

                {/* Soft evening wash */}
                <Circle cx="210" cy="70" r="36" fill="#FFE8B8" opacity="0.55" />
                <Circle cx="210" cy="70" r="22" fill="#FFF3D6" opacity="0.9" />

                {/* Distant soft hills */}
                <Ellipse cx="190" cy="168" rx="100" ry="36" fill="#E8D5AE" opacity="0.7" />
                <Ellipse cx="70" cy="190" rx="90" ry="40" fill="#E2CDA6" opacity="0.55" />

                {/* Far person — smaller, cooler, soft */}
                <Circle cx="200" cy="148" r="40" fill="url(#unc_far)" />
                <Ellipse cx="200" cy="132" rx="13" ry="14" fill="#A89880" opacity="0.55" />
                <Path
                    d="M 178 168 C 178 148, 222 148, 222 168 L 224 198 C 210 206, 190 206, 176 198 Z"
                    fill="#B5A48C"
                    opacity="0.45"
                />

                {/* Soft mist between them */}
                <Ellipse cx="140" cy="160" rx="46" ry="18" fill="#FFF8EC" opacity="0.55" />
                <Ellipse cx="128" cy="152" rx="28" ry="10" fill="#FFF8EC" opacity="0.4" />

                {/* Near person — larger, warmer, present */}
                <Circle cx="88" cy="170" r="58" fill="url(#unc_near)" />
                <Ellipse cx="86" cy="142" rx="20" ry="22" fill={BRAND.primary} />
                <Path
                    d="M 52 188 C 52 160, 120 160, 120 188 L 124 236 C 100 248, 72 248, 48 236 Z"
                    fill={BRAND.primaryDark}
                    opacity="0.92"
                />
                {/* Subtle forward lean of the shoulder toward the distance */}
                <Ellipse cx="108" cy="188" rx="16" ry="10" fill={BRAND.primary} opacity="0.55" />

                <Rect x="0" y="220" width="280" height="60" fill="url(#unc_land)" />
            </ArtBoard>
        </Svg>
    );
}

/**
 * Differentiate — presence without watching.
 * Two equal silhouettes sharing one soft warm field between them.
 * The field is a glow — not wires, not GPS, not a diagram.
 */
export function ReassuranceIllustration({ size = 280 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 280 280" fill="none">
            <ArtBoard>
                <Defs>
                    <RadialGradient id="rea_field" cx="0.5" cy="0.5" r="0.55">
                        <Stop offset="0" stopColor={BRAND.statusGreen} stopOpacity="0.28" />
                        <Stop offset="0.55" stopColor={BRAND.primary} stopOpacity="0.12" />
                        <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
                    </RadialGradient>
                    <RadialGradient id="rea_L" cx="0.5" cy="0.45" r="0.55">
                        <Stop offset="0" stopColor={BRAND.primary} stopOpacity="0.3" />
                        <Stop offset="1" stopColor={BRAND.primary} stopOpacity="0" />
                    </RadialGradient>
                    <RadialGradient id="rea_R" cx="0.5" cy="0.45" r="0.55">
                        <Stop offset="0" stopColor={BRAND.statusGreen} stopOpacity="0.28" />
                        <Stop offset="1" stopColor={BRAND.statusGreen} stopOpacity="0" />
                    </RadialGradient>
                </Defs>

                {/* Shared calm field between them */}
                <Ellipse cx="140" cy="150" rx="88" ry="54" fill="url(#rea_field)" />

                {/* Left silhouette */}
                <Circle cx="88" cy="150" r="52" fill="url(#rea_L)" />
                <Ellipse cx="88" cy="118" rx="18" ry="19" fill={BRAND.primary} />
                <Path
                    d="M 58 158 C 58 134, 118 134, 118 158 L 120 208 C 104 218, 72 218, 56 208 Z"
                    fill={BRAND.primaryDark}
                    opacity="0.9"
                />

                {/* Right silhouette */}
                <Circle cx="192" cy="150" r="52" fill="url(#rea_R)" />
                <Ellipse cx="192" cy="118" rx="18" ry="19" fill={BRAND.statusGreen} />
                <Path
                    d="M 162 158 C 162 134, 222 134, 222 158 L 224 208 C 208 218, 176 218, 160 208 Z"
                    fill="#3D9A6C"
                    opacity="0.9"
                />

                {/* Quiet heart of presence — soft, centered, small */}
                <Circle cx="140" cy="150" r="16" fill="#FFF8EC" opacity="0.95" />
                <Path
                    d="M 140 144.5 C 136.5 141, 131 143, 131 147.5 C 131 153, 140 159, 140 159 C 140 159, 149 153, 149 147.5 C 149 143, 143.5 141, 140 144.5 Z"
                    fill={BRAND.statusGreen}
                    opacity="0.9"
                />
            </ArtBoard>
        </Svg>
    );
}

/* ─── Step header icons ───────────────────────────────────────────────────── */

export function ProfileIcon({ size = 56 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
            <Defs>
                <LinearGradient id="pi_g" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={BRAND.primaryLight} />
                    <Stop offset="1" stopColor={BRAND.primary} />
                </LinearGradient>
            </Defs>
            <Circle cx="28" cy="28" r="26" fill={`${BRAND.primary}16`} />
            <Circle cx="28" cy="22" r="10" fill="url(#pi_g)" />
            <Path
                d="M 12 46 C 12 34, 44 34, 44 46"
                fill={BRAND.primaryDark}
                opacity="0.88"
            />
        </Svg>
    );
}

export function PermissionsIcon({ size = 56 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
            <Defs>
                <LinearGradient id="pe_g" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={BRAND.primaryLight} />
                    <Stop offset="1" stopColor={BRAND.primary} />
                </LinearGradient>
            </Defs>
            <Circle cx="28" cy="28" r="26" fill={`${BRAND.primary}16`} />
            <Path
                d="M 28 10 L 42 16.5 V 28 C 42 38, 34.5 44, 28 46 C 21.5 44, 14 38, 14 28 V 16.5 Z"
                fill="url(#pe_g)"
            />
            <Path
                d="M 28 22 C 25.2 22, 23.5 24, 23.5 26.4 C 23.5 30, 28 33.5, 28 33.5 C 28 33.5, 32.5 30, 32.5 26.4 C 32.5 24, 30.8 22, 28 22 Z"
                fill={BRAND.white}
            />
        </Svg>
    );
}

export function NotificationsGlyph({ size = 44 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
            <Circle cx="22" cy="22" r="20" fill={`${BRAND.primary}14`} />
            <Path
                d="M 22 11 C 17.2 11, 14.5 14.8, 14.5 18.8 V 24.2 L 11.5 28.5 H 32.5 L 29.5 24.2 V 18.8 C 29.5 14.8, 26.8 11, 22 11 Z"
                fill={BRAND.primary}
            />
            <Path
                d="M 19 30.5 C 19.4 32.8, 24.6 32.8, 25 30.5"
                stroke={BRAND.primaryDark}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
            />
            <Circle cx="30" cy="13" r="4.5" fill={BRAND.statusGreen} />
        </Svg>
    );
}

export function LocationGlyph({ size = 44 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 44 44" fill="none">
            <Circle cx="22" cy="22" r="20" fill={`${BRAND.primary}14`} />
            <Circle cx="22" cy="20" r="11" stroke={BRAND.primary} strokeWidth="1.6" fill="none" opacity="0.28" />
            <Circle cx="22" cy="20" r="6.5" stroke={BRAND.primary} strokeWidth="1.6" fill="none" opacity="0.5" />
            <Circle cx="22" cy="20" r="3" fill={BRAND.primary} />
            <Rect x="12" y="31" width="4" height="5" rx="1" fill={BRAND.primaryDark} opacity="0.45" />
            <Rect x="18" y="29" width="5" height="7" rx="1" fill={BRAND.primaryDark} opacity="0.6" />
            <Rect x="25" y="30.5" width="4" height="5.5" rx="1" fill={BRAND.primaryDark} opacity="0.4" />
            <Rect x="31" y="29.5" width="4" height="6.5" rx="1" fill={BRAND.primaryDark} opacity="0.5" />
        </Svg>
    );
}

/* ─── Relation glyphs (custom, not emoji) ─────────────────────────────────── */

export type RelationId = "mom" | "dad" | "partner" | "child" | "sibling" | "friend" | "other";

const RELATION_TONES: Record<RelationId, { fill: string; soft: string }> = {
    mom:     { fill: "#E8A07A", soft: "#E8A07A33" },
    dad:     { fill: "#6B8FBF", soft: "#6B8FBF33" },
    partner: { fill: "#D9788A", soft: "#D9788A33" },
    child:   { fill: "#E0B04A", soft: "#E0B04A33" },
    sibling: { fill: "#7BA88A", soft: "#7BA88A33" },
    friend:  { fill: "#9B7EBF", soft: "#9B7EBF33" },
    other:   { fill: BRAND.primaryDark, soft: `${BRAND.primary}28` },
};

/**
 * Distinct silhouette marks per relation — flat, warm, intentional.
 */
export function RelationGlyph({
    id,
    size = 40,
    selected = false,
}: {
    id: RelationId;
    size?: number;
    selected?: boolean;
}) {
    const tone = RELATION_TONES[id];
    const fill = selected ? tone.fill : tone.fill;
    const soft = selected ? `${tone.fill}40` : tone.soft;

    return (
        <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Circle cx="24" cy="24" r="22" fill={soft} />
            {id === "mom" && (
                <G>
                    {/* Soft hair arc + figure */}
                    <Path
                        d="M 12 22 C 12 10, 36 10, 36 22"
                        fill={fill}
                        opacity="0.35"
                    />
                    <Circle cx="24" cy="18" r="7.5" fill={fill} />
                    <Path
                        d="M 12 40 C 12 30, 36 30, 36 40"
                        fill={fill}
                        opacity="0.9"
                    />
                </G>
            )}
            {id === "dad" && (
                <G>
                    <Circle cx="24" cy="17" r="7.5" fill={fill} />
                    <Path
                        d="M 11 40 C 11 29.5, 37 29.5, 37 40"
                        fill={fill}
                        opacity="0.9"
                    />
                    {/* Broader shoulder suggestion */}
                    <Ellipse cx="24" cy="31" rx="13" ry="4" fill={fill} opacity="0.35" />
                </G>
            )}
            {id === "partner" && (
                <G>
                    <Circle cx="17" cy="18" r="6" fill={fill} opacity="0.85" />
                    <Circle cx="31" cy="18" r="6" fill={fill} />
                    <Path
                        d="M 8 38 C 8 29, 22 28, 24 34 C 26 28, 40 29, 40 38"
                        fill={fill}
                        opacity="0.9"
                    />
                </G>
            )}
            {id === "child" && (
                <G>
                    <Circle cx="24" cy="17" r="8.5" fill={fill} />
                    {/* Smaller stature body */}
                    <Path
                        d="M 14 40 C 14 31, 34 31, 34 40"
                        fill={fill}
                        opacity="0.9"
                    />
                    <Circle cx="18" cy="16" r="1.6" fill="#FFF8EC" opacity="0.7" />
                    <Circle cx="30" cy="16" r="1.6" fill="#FFF8EC" opacity="0.7" />
                </G>
            )}
            {id === "sibling" && (
                <G>
                    <Circle cx="16" cy="17" r="5.5" fill={fill} opacity="0.75" />
                    <Circle cx="30" cy="16" r="6.5" fill={fill} />
                    <Path
                        d="M 7 39 C 7 31, 21 30, 23 36"
                        fill={fill}
                        opacity="0.65"
                    />
                    <Path
                        d="M 25 39 C 25 30, 41 29, 41 39"
                        fill={fill}
                        opacity="0.9"
                    />
                </G>
            )}
            {id === "friend" && (
                <G>
                    <Circle cx="15" cy="19" r="5.5" fill={fill} opacity="0.7" />
                    <Circle cx="33" cy="19" r="5.5" fill={fill} opacity="0.7" />
                    <Circle cx="24" cy="16" r="6.5" fill={fill} />
                    <Path
                        d="M 8 40 C 8 32, 20 31, 24 36 C 28 31, 40 32, 40 40"
                        fill={fill}
                        opacity="0.88"
                    />
                </G>
            )}
            {id === "other" && (
                <G>
                    {/* Soft spark / open figure */}
                    <Circle cx="24" cy="18" r="7" fill={fill} />
                    <Path
                        d="M 13 40 C 13 31, 35 31, 35 40"
                        fill={fill}
                        opacity="0.88"
                    />
                    <Circle cx="36" cy="12" r="3" fill={fill} opacity="0.55" />
                    <Circle cx="11" cy="14" r="2.2" fill={fill} opacity="0.4" />
                </G>
            )}
        </Svg>
    );
}
