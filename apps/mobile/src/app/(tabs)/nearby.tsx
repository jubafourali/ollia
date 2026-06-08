import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
    Animated,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BRAND from "@/constants/colors";
import { useFamilyContext } from "@/context/FamilyContext";
import type { ApiNearbyEvent } from "@/utils/api";
import { SkyHeader, sheetStyle } from "@/components/SkyScreen";
import { CityPicker } from "@/components/CityPicker";

// ── Risk config ───────────────────────────────────────────────────────────────

type Risk = ApiNearbyEvent["riskLevel"];

const RISK_COLOR: Record<string, string> = {
    IMPORTANT_DISRUPTION: "#EF4444",
    STAY_AWARE:           "#F59E0B",
    NORMAL:               "#6B7280",
};

const RISK_ICON: Record<string, string> = {
    IMPORTANT_DISRUPTION: "alert-triangle",
    STAY_AWARE:           "alert-circle",
    NORMAL:               "info",
};

const RISK_LABEL: Record<string, string> = {
    IMPORTANT_DISRUPTION: "Worth checking in",
    STAY_AWARE:           "Worth knowing",
    NORMAL:               "Low concern",
};

// Banner-level copy keyed off the worst risk found in the selected region.
const BANNER_STATUS: Record<string, { label: string; icon: string }> = {
    IMPORTANT_DISRUPTION: { label: "Important disruption", icon: "alert-triangle" },
    STAY_AWARE:           { label: "Stay aware",           icon: "alert-circle" },
    NORMAL:               { label: "All clear",            icon: "check-circle" },
};

/** First comma-separated token of a region string, lower-cased — the "city". */
function cityToken(region: string): string {
    return region.split(",")[0]?.trim().toLowerCase() ?? "";
}

/** Pretty short label ("Ubud" from "Ubud, Bali, Indonesia"). */
function shortLabel(region: string): string {
    return region.split(",")[0]?.trim() || region;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonSection() {
    const opacity = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, []);
    return (
        <Animated.View style={{ opacity }}>
            <View style={sk.banner} />
            <View style={[sk.card, { marginTop: 16 }]} />
            <View style={[sk.card, { marginTop: 8, opacity: 0.5 }]} />
        </Animated.View>
    );
}

const sk = StyleSheet.create({
    banner: { height: 96, borderRadius: 18, backgroundColor: BRAND.backgroundCard, borderWidth: 1, borderColor: BRAND.borderLight },
    card:   { height: 90, borderRadius: 14, backgroundColor: BRAND.backgroundCard, borderWidth: 1, borderColor: BRAND.borderLight },
});

// ── Region dropdown (header, top-right) ─────────────────────────────────────────

function RegionDropdown({ region, onPress }: { region: string; onPress: () => void }) {
    return (
        <Pressable
            style={({ pressed }) => [rd.trigger, pressed && { opacity: 0.8 }]}
            onPress={onPress}
            hitSlop={8}
        >
            <Text style={rd.text} numberOfLines={1}>
                📍 Near You: {shortLabel(region) || "Choose region"}
            </Text>
            <Feather name="chevron-down" size={14} color="#ffffff" />
        </Pressable>
    );
}

const rd = StyleSheet.create({
    trigger: {
        flexDirection: "row", alignItems: "center", gap: 6,
        maxWidth: 200,
        backgroundColor: "rgba(255,255,255,0.16)",
        borderRadius: 999,
        paddingLeft: 12, paddingRight: 10, paddingVertical: 7,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
    },
    text: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#ffffff", flexShrink: 1 },
});

// ── Region picker overlay (searchable + quick picks) ────────────────────────────

function RegionPickerOverlay({
    visible,
    current,
    quickPicks,
    onSelect,
    onClose,
}: {
    visible: boolean;
    current: string;
    quickPicks: string[];
    onSelect: (region: string) => void;
    onClose: () => void;
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={ov.backdrop} onPress={onClose}>
                {/* Stop propagation so taps inside the sheet don't dismiss it */}
                <Pressable style={ov.sheet} onPress={() => {}}>
                    <View style={ov.handle} />
                    <Text style={ov.title}>Choose a region</Text>
                    <Text style={ov.subtitle}>
                        See live safety status and local events for any place.
                    </Text>

                    {/* Searchable location input — same component as Settings */}
                    <CityPicker
                        value={current}
                        defaultOpen
                        placeholder="Search a city or region…"
                        onChange={(displayName) => {
                            if (Platform.OS !== "web") Haptics.selectionAsync();
                            onSelect(displayName);
                            onClose();
                        }}
                        onCancel={onClose}
                    />

                    {/* Quick picks — regions already in your circle */}
                    {quickPicks.length > 0 && (
                        <>
                            <Text style={ov.sectionLabel}>Your circle</Text>
                            <View style={ov.chipRow}>
                                {quickPicks.map((region) => {
                                    const active = cityToken(region) === cityToken(current);
                                    return (
                                        <Pressable
                                            key={region}
                                            style={({ pressed }) => [
                                                ov.chip,
                                                active && ov.chipActive,
                                                pressed && { opacity: 0.8 },
                                            ]}
                                            onPress={() => {
                                                if (Platform.OS !== "web") Haptics.selectionAsync();
                                                onSelect(region);
                                                onClose();
                                            }}
                                        >
                                            <Feather
                                                name="map-pin"
                                                size={12}
                                                color={active ? BRAND.primaryDark : BRAND.textSecondary}
                                            />
                                            <Text style={[ov.chipText, active && ov.chipTextActive]} numberOfLines={1}>
                                                {shortLabel(region)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const ov = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: BRAND.overlay,
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: BRAND.background,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40,
    },
    handle: {
        alignSelf: "center", width: 40, height: 4, borderRadius: 2,
        backgroundColor: BRAND.border, marginBottom: 18,
    },
    title:    { fontSize: 20, fontFamily: "Inter_700Bold", color: BRAND.text },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, marginTop: 4, marginBottom: 16, lineHeight: 18 },
    sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: BRAND.textMuted, marginTop: 18, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: BRAND.backgroundCard,
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: BRAND.borderLight, maxWidth: "100%",
    },
    chipActive: { backgroundColor: `${BRAND.primary}18`, borderColor: `${BRAND.primary}50` },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.textSecondary, flexShrink: 1 },
    chipTextActive: { color: BRAND.primaryDark, fontFamily: "Inter_600SemiBold" },
});

// ── Safety status banner (SAIAE smart summary) ──────────────────────────────────

function SafetyBanner({
    region,
    worstRisk,
    eventCount,
    summary,
}: {
    region: string;
    worstRisk: Risk;
    eventCount: number;
    summary: string;
}) {
    const status = BANNER_STATUS[worstRisk];
    const color = worstRisk === "NORMAL" ? BRAND.statusGreen : RISK_COLOR[worstRisk];

    return (
        <View style={[sb.card, { borderColor: `${color}40`, backgroundColor: `${color}0E` }]}>
            <View style={sb.topRow}>
                <View style={[sb.iconWrap, { backgroundColor: `${color}1F` }]}>
                    <Feather name={status.icon as any} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[sb.status, { color }]}>{status.label}</Text>
                    <Text style={sb.region} numberOfLines={1}>
                        {shortLabel(region) || "your area"}
                    </Text>
                </View>
                <View style={[sb.countPill, { backgroundColor: `${color}1A`, borderColor: `${color}3A` }]}>
                    <Text style={[sb.countText, { color }]}>
                        {eventCount} {eventCount === 1 ? "signal" : "signals"}
                    </Text>
                </View>
            </View>

            <Text style={sb.summary}>{summary}</Text>

            <View style={sb.footer}>
                <Feather name="shield" size={11} color={BRAND.textMuted} />
                <Text style={sb.footerText}>Cross-checked by Ollia · verified sources only</Text>
            </View>
        </View>
    );
}

const sb = StyleSheet.create({
    card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12, marginBottom: 22 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    status: { fontSize: 16, fontFamily: "Inter_700Bold" },
    region: { fontSize: 12, fontFamily: "Inter_500Medium", color: BRAND.textSecondary, marginTop: 1 },
    countPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    countText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    summary: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 21 },
    footer: { flexDirection: "row", alignItems: "center", gap: 5 },
    footerText: { fontSize: 11, fontFamily: "Inter_500Medium", color: BRAND.textMuted },
});

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: ApiNearbyEvent }) {
    const color = RISK_COLOR[event.riskLevel] ?? "#6B7280";
    const icon  = RISK_ICON[event.riskLevel]  ?? "info";
    const label = RISK_LABEL[event.riskLevel] ?? "Low concern";

    return (
        <View style={[ec.card, { borderColor: `${color}40`, backgroundColor: `${color}08` }]}>
            <View style={ec.header}>
                <View style={[ec.iconWrap, { backgroundColor: `${color}18` }]}>
                    <Feather name={icon as any} size={14} color={color} />
                </View>
                <Text style={[ec.eventLabel, { color }]} numberOfLines={1}>
                    {event.eventLabel}
                </Text>
            </View>

            <Text style={ec.sentence}>{event.sentence}</Text>

            <View style={ec.footer}>
                <View style={ec.sourceRow}>
                    <Feather name="shield" size={10} color="#059669" />
                    <Text style={ec.sourceText} numberOfLines={1}>{event.sourcesLabel}</Text>
                </View>
                <View style={[ec.pill, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                    <Text style={[ec.pillText, { color }]}>{label}</Text>
                </View>
            </View>
        </View>
    );
}

const ec = StyleSheet.create({
    card: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, marginBottom: 8, gap: 8 },
    header: { flexDirection: "row", alignItems: "center", gap: 8 },
    iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    eventLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
    sentence: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 19 },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    sourceRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
    sourceText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#059669" },
    pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    pillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

// ── Quiet / empty feed ──────────────────────────────────────────────────────────

function QuietFeed({ region }: { region: string }) {
    return (
        <View style={qf.card}>
            <View style={qf.dot} />
            <Text style={qf.text}>
                Nothing to flag around {shortLabel(region) || "this area"} right now. Ollia is keeping watch.
            </Text>
        </View>
    );
}

const qf = StyleSheet.create({
    card: {
        flexDirection: "row", alignItems: "center", gap: 10,
        backgroundColor: `${BRAND.statusGreen}08`,
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14,
        borderWidth: 1, borderColor: `${BRAND.statusGreen}30`,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.statusGreen },
    text: { fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, flex: 1, lineHeight: 19 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NearbyScreen() {
    const insets = useSafeAreaInsets();
    const {
        myProfile,
        members,
        travelMode,
        travelDestination,
        nearbyRegion,
        refreshNearby,
        refreshSafetyEvents: refreshAlerts,
    } = useFamilyContext();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    // The region currently being viewed. Defaults to the user's active location
    // (travel destination while travelling, otherwise their home region). This is
    // local screen state — picking a region here only changes what you're viewing,
    // it does not move your profile.
    const defaultRegion = travelMode && travelDestination ? travelDestination : myProfile?.region ?? "";
    const [region, setRegion] = useState(defaultRegion);
    const userTouchedRef = useRef(false);

    // Adopt the profile's region once it loads, unless the user already picked one.
    useEffect(() => {
        if (!userTouchedRef.current && defaultRegion) setRegion(defaultRegion);
    }, [defaultRegion]);

    // ── Fade-driven load ──────────────────────────────────────────────────────────
    // Fetching itself lives in FamilyContext (same as `alerts`); the screen just asks
    // the context to load a region and sequences the fade around it: dim → swap → in.
    // Both the banner and the feed read from the single `nearbyRegion` object, so they
    // always re-render in lock-step.
    const contentOpacity = useRef(new Animated.Value(1)).current;

    const shownRef = useRef(false); // have we painted real content for some region yet?

    const load = useCallback(async (r: string, withFade: boolean) => {
        if (!r.trim()) { setLoading(false); return; }
        if (withFade) {
            Animated.timing(contentOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start();
        }
        await refreshNearby(r);
        setLoading(false);
        setRefreshing(false);
        shownRef.current = true;
        Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, [contentOpacity, refreshNearby]);

    // Ensure the viewed region is loaded. If the context already has it (seeded in the
    // background, or loaded earlier), use it as-is — no refetch. Otherwise load it,
    // cross-fading only once we already have content on screen for another region.
    useEffect(() => {
        if (!region.trim()) { setLoading(false); return; }
        if (nearbyRegion && cityToken(nearbyRegion.region) === cityToken(region)) {
            setLoading(false);
            shownRef.current = true;
            return;
        }
        load(region, shownRef.current);
    }, [region, nearbyRegion, load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Promise.all([load(region, false), refreshAlerts()]);
    }, [load, region, refreshAlerts]);

    // Quick-pick regions = your own location + distinct regions present in the circle.
    const quickPicks = useMemo(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const r of [defaultRegion, ...members.map((m) => m.region)]) {
            if (!r) continue;
            const key = cityToken(r);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(r);
        }
        return out;
    }, [members, defaultRegion]);

    const handlePickRegion = useCallback((next: string) => {
        userTouchedRef.current = true;
        setRegion(next);
    }, []);

    const events = nearbyRegion?.events ?? [];
    const worstRisk: Risk = nearbyRegion?.worstRisk ?? "NORMAL";
    const summary = nearbyRegion?.summary
        || `Things look calm around ${shortLabel(region) || "this area"}. Nothing needs your attention right now.`;

    return (
        <View style={styles.container}>
            <SkyHeader
                title="Nearby"
                subtitle={loading ? "Checking…" : "Live safety & local events"}
                right={
                    <RegionDropdown
                        region={region}
                        onPress={() => {
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setPickerOpen(true);
                        }}
                    />
                }
            />

            <ScrollView
                style={sheetStyle}
                contentContainerStyle={[styles.content, { paddingTop: 24, paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={BRAND.primary}
                        colors={[BRAND.primary]}
                    />
                }
            >
                {loading ? (
                    <SkeletonSection />
                ) : (
                    // Banner + feed share one Animated.View so they fade together.
                    <Animated.View style={{ opacity: contentOpacity }}>
                        <SafetyBanner
                            region={region}
                            worstRisk={worstRisk}
                            eventCount={events.length}
                            summary={summary}
                        />

                        <View style={styles.feedHeader}>
                            <Text style={styles.feedTitle}>Local events</Text>
                            <Text style={styles.feedSub}>{shortLabel(region) || "Your area"}</Text>
                        </View>

                        {events.length === 0 ? (
                            <QuietFeed region={region} />
                        ) : (
                            events.map((e) => <EventCard key={e.eventId} event={e} />)
                        )}
                    </Animated.View>
                )}
            </ScrollView>

            <RegionPickerOverlay
                visible={pickerOpen}
                current={region}
                quickPicks={quickPicks}
                onSelect={handlePickRegion}
                onClose={() => setPickerOpen(false)}
            />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "transparent" },
    content:   { paddingHorizontal: 20, paddingTop: 4 },

    feedHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 },
    feedTitle:  { fontSize: 17, fontFamily: "Inter_700Bold", color: BRAND.text },
    feedSub:    { fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.textMuted },
});