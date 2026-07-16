import React from "react";
import { Image, ImageSourcePropType, StyleSheet, View } from "react-native";
import Svg, {
    Circle,
    Path,
    Defs,
    LinearGradient,
    Stop,
} from "react-native-svg";
import BRAND from "@/constants/colors";

/**
 * Premium raster illustrations (Calm / Headspace quality).
 * SVGs kept only for tiny chrome glyphs (profile / permissions rows).
 */

const ART = {
    uncertainty: require("../../../assets/onboarding/onboarding-uncertainty.png"),
    reassurance: require("../../../assets/onboarding/onboarding-reassurance.png"),
} as const;

const RELATION_ART: Record<RelationId, ImageSourcePropType> = {
    mom: require("../../../assets/onboarding/relation-mom.png"),
    dad: require("../../../assets/onboarding/relation-dad.png"),
    partner: require("../../../assets/onboarding/relation-partner.png"),
    child: require("../../../assets/onboarding/relation-child.png"),
    sibling: require("../../../assets/onboarding/relation-sibling.png"),
    friend: require("../../../assets/onboarding/relation-friend.png"),
    other: require("../../../assets/onboarding/relation-other.png"),
};

function HeroArt({
    source,
    size = 280,
}: {
    source: ImageSourcePropType;
    size?: number;
}) {
    return (
        <View style={[styles.heroWrap, { width: size, height: size, borderRadius: size * 0.14 }]}>
            <Image
                source={source}
                style={{ width: size, height: size, borderRadius: size * 0.14 }}
                resizeMode="cover"
            />
        </View>
    );
}

export function UncertaintyIllustration({ size = 280 }: { size?: number }) {
    return <HeroArt source={ART.uncertainty} size={size} />;
}

export function ReassuranceIllustration({ size = 280 }: { size?: number }) {
    return <HeroArt source={ART.reassurance} size={size} />;
}

/* ─── Step header icons (compact SVG chrome) ──────────────────────────────── */

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
            <Path d="M 12 46 C 12 34, 44 34, 44 46" fill={BRAND.primaryDark} opacity="0.88" />
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
        </Svg>
    );
}

/* ─── Relation glyphs (premium raster) ────────────────────────────────────── */

export type RelationId = "mom" | "dad" | "partner" | "child" | "sibling" | "friend" | "other";

export function RelationGlyph({
    id,
    size = 48,
    selected = false,
}: {
    id: RelationId;
    size?: number;
    selected?: boolean;
}) {
    return (
        <View
            style={[
                styles.relationWrap,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    transform: [{ scale: selected ? 1.04 : 1 }],
                },
            ]}
        >
            <Image
                source={RELATION_ART[id]}
                style={{ width: size, height: size, borderRadius: size / 2 }}
                resizeMode="cover"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    heroWrap: {
        overflow: "hidden",
        backgroundColor: BRAND.backgroundCard,
        shadowColor: BRAND.primaryDark,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
    },
    relationWrap: {
        overflow: "hidden",
        backgroundColor: BRAND.backgroundCard,
    },
});
