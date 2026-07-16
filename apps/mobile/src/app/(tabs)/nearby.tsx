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
import type { ApiCoverage, ApiNearbyEvent, ApiPlaceSituation } from "@/utils/api";
import { formatCoverageQuietLine, coveragePackTitle, coverageGapChips } from "@/utils/coverageCopy";
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
    NORMAL:               { label: "Checked & clear",      icon: "check-circle" },
};

const TONE_META: Record<string, { label: string; color: string; icon: string }> = {
    calm:      { label: "Settled",    color: BRAND.statusGreen, icon: "sun" },
    unsettled: { label: "Unsettled",  color: "#F59E0B",         icon: "cloud" },
    disrupted: { label: "Disrupted",  color: "#EF4444",         icon: "alert-triangle" },
};

function weatherIcon(code: number): string {
    if (code === 0 || code === 1) return "sun";
    if (code >= 95) return "cloud-lightning";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "cloud-drizzle";
    return "cloud";
}

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

// ── Place situation ("being there") ───────────────────────────────────────────

function SituationCard({ situation }: { situation: ApiPlaceSituation }) {
    const tone = TONE_META[situation.tone] ?? TONE_META.calm;
    const wx = situation.weather;
    return (
        <View style={[sit.card, { borderColor: `${tone.color}35`, backgroundColor: `${tone.color}0C` }]}>
            <View style={sit.topRow}>
                <View style={[sit.iconWrap, { backgroundColor: `${tone.color}22` }]}>
                    <Feather
                        name={(wx ? weatherIcon(wx.weatherCode) : tone.icon) as any}
                        size={22}
                        color={tone.color}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={sit.place}>{situation.placeLabel}</Text>
                    <Text style={[sit.tone, { color: tone.color }]}>{tone.label}</Text>
                </View>
                {wx ? (
                    <View style={sit.tempBlock}>
                        <Text style={sit.temp}>{Math.round(wx.temperatureC)}°</Text>
                    </View>
                ) : null}
            </View>

            {situation.overall ? <Text style={sit.overall}>{situation.overall}</Text> : null}

            {situation.knowledge && situation.knowledge.length > 0 ? (
                <View style={sit.knowledgeWrap}>
                    {situation.knowledge.slice(0, 4).map((line) => (
                        <View key={line} style={sit.knowledgeChip}>
                            <Text style={sit.knowledgeText}>{line}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            {wx ? (
                <View style={sit.statsRow}>
                    <Text style={sit.statInline}>{wx.condition}</Text>
                    <Text style={sit.dot}>·</Text>
                    <Text style={sit.statInline}>{Math.round(wx.windKmh)} km/h</Text>
                    {wx.humidityPct != null ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>{wx.humidityPct}%</Text>
                        </>
                    ) : null}
                    {wx.aqi != null ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>AQI {wx.aqi}</Text>
                        </>
                    ) : null}
                    {wx.dustLabel && wx.dustLabel !== "low" && wx.dustLabel !== "none" ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>Dust {wx.dustLabel}</Text>
                        </>
                    ) : null}
                    {wx.pollenLevel && wx.pollenLevel !== "none" && wx.pollenLevel !== "low" ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>
                                {wx.pollenType ?? "Pollen"} {wx.pollenLevel}
                            </Text>
                        </>
                    ) : null}
                    {wx.uvIndex != null && wx.uvIndex >= 1 ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>UV {Math.round(wx.uvIndex)}</Text>
                        </>
                    ) : null}
                    {wx.precipNextHoursMm != null && wx.precipNextHoursMm >= 0.2 ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>{wx.precipNextHoursMm.toFixed(1)} mm</Text>
                        </>
                    ) : null}
                    {wx.highC != null && wx.lowC != null ? (
                        <>
                            <Text style={sit.dot}>·</Text>
                            <Text style={sit.statInline}>
                                {Math.round(wx.highC)}°/{Math.round(wx.lowC)}°
                            </Text>
                        </>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

const sit = StyleSheet.create({
    card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 10, marginBottom: 10 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    place: { fontSize: 18, fontFamily: "Inter_700Bold", color: BRAND.text },
    tone: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
    tempBlock: { flexDirection: "row", alignItems: "flex-start" },
    temp: { fontSize: 34, fontFamily: "Inter_700Bold", color: BRAND.text, lineHeight: 36 },
    overall: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 19 },
    knowledgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    knowledgeChip: {
        backgroundColor: "rgba(255,255,255,0.7)",
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(0,0,0,0.06)",
    },
    knowledgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: BRAND.textSecondary },
    statsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
    statInline: { fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.textSecondary },
    dot: { fontSize: 13, color: BRAND.textMuted },
});

// ── Instruments strip (minimal) ───────────────────────────────────────────────

function InstrumentsStrip({
    worstRisk,
    eventCount,
    coverage,
}: {
    worstRisk: Risk;
    eventCount: number;
    coverage?: ApiCoverage | null;
}) {
    const status = BANNER_STATUS[worstRisk];
    const color = worstRisk === "NORMAL" ? BRAND.statusGreen : RISK_COLOR[worstRisk];
    const gaps = worstRisk === "NORMAL" ? coverageGapChips(coverage).slice(0, 3) : [];

    return (
        <View style={[inst.card, { borderColor: `${color}22` }]}>
            <View style={inst.topRow}>
                <Feather name={status.icon as any} size={14} color={color} />
                <Text style={[inst.status, { color }]}>{status.label}</Text>
                <Text style={inst.count}>
                    {eventCount} {eventCount === 1 ? "alert" : "alerts"}
                </Text>
            </View>
            {gaps.length > 0 ? (
                <Text style={inst.gapLine}>
                    Not {gaps.map((g) => g.toLowerCase()).join(" · ")}
                </Text>
            ) : null}
        </View>
    );
}

const inst = StyleSheet.create({
    card: {
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderWidth: 1,
        backgroundColor: BRAND.backgroundCard,
        gap: 4,
        marginBottom: 12,
    },
    topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    status: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
    count: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: BRAND.textMuted },
    gapLine: { fontSize: 11, fontFamily: "Inter_400Regular", color: BRAND.textMuted, paddingLeft: 22 },
});

// ── Legacy banner kept for alert-heavy states without situation ───────────────

function SafetyBanner({
    region,
    worstRisk,
    eventCount,
    summary,
    coverage,
}: {
    region: string;
    worstRisk: Risk;
    eventCount: number;
    summary: string;
    coverage?: ApiCoverage | null;
}) {
    const status = BANNER_STATUS[worstRisk];
    const color = worstRisk === "NORMAL" ? BRAND.statusGreen : RISK_COLOR[worstRisk];
    const gaps = worstRisk === "NORMAL" ? coverageGapChips(coverage) : [];

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

            {gaps.length > 0 ? (
                <View style={sb.gapBlock}>
                    <Text style={sb.gapLabel}>Not covered</Text>
                    <View style={sb.chipRow}>
                        {gaps.map((g) => (
                            <View key={g} style={sb.chip}>
                                <Text style={sb.chipText}>{g}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            ) : null}

            <View style={sb.footer}>
                <Feather name="shield" size={11} color={BRAND.textMuted} />
                <Text style={sb.footerText}>Instruments checked · quiet ≠ omniscience</Text>
            </View>
        </View>
    );
}

const sb = StyleSheet.create({
    card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12, marginBottom: 18 },
    topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    status: { fontSize: 16, fontFamily: "Inter_700Bold" },
    region: { fontSize: 12, fontFamily: "Inter_500Medium", color: BRAND.textSecondary, marginTop: 1 },
    countPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    countText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    summary: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 21 },
    gapBlock: { gap: 8 },
    gapLabel: {
        fontSize: 11,
        fontFamily: "Inter_600SemiBold",
        color: BRAND.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: "rgba(107,114,128,0.10)",
        borderWidth: 1,
        borderColor: "rgba(107,114,128,0.18)",
    },
    chipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: BRAND.textSecondary },
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

// ── Coverage pack (compact) ───────────────────────────────────────────────────

function CoveragePackPanel({ coverage }: { coverage?: ApiCoverage | null }) {
    const [open, setOpen] = useState(false);
    if (!coverage) return null;
    const sources = coverage.sourcesActive || [];
    return (
        <View style={cp.card}>
            <Pressable
                style={cp.header}
                onPress={() => setOpen((v) => !v)}
                hitSlop={6}
            >
                <Text style={cp.title}>{coveragePackTitle(coverage)}</Text>
                <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={BRAND.textMuted} />
            </Pressable>
            {open ? (
                <View style={cp.body}>
                    <Text style={cp.line}>Sources: {sources.join(", ")}</Text>
                    {coverage.disclaimer ? <Text style={cp.disclaimer}>{coverage.disclaimer}</Text> : null}
                </View>
            ) : (
                <Text style={cp.hint}>Tap for sources</Text>
            )}
        </View>
    );
}

const cp = StyleSheet.create({
    card: {
        marginTop: 4,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: BRAND.backgroundCard,
        borderWidth: 1,
        borderColor: BRAND.borderLight,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: BRAND.text },
    hint: { marginTop: 4, fontSize: 11, fontFamily: "Inter_400Regular", color: BRAND.textMuted },
    body: { marginTop: 10, gap: 6 },
    line: { fontSize: 12, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, lineHeight: 17 },
    disclaimer: { fontSize: 11, fontFamily: "Inter_400Regular", color: BRAND.textMuted, lineHeight: 15 },
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
    const coverage = nearbyRegion?.coverage;
    const situation = nearbyRegion?.situation;
    const summary = nearbyRegion?.summary
        || formatCoverageQuietLine(shortLabel(region) || "this area", coverage);

    return (
        <View style={styles.container}>
            <SkyHeader
                title="Nearby"
                subtitle={loading ? "Checking…" : "Live conditions"}
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
                    <Animated.View style={{ opacity: contentOpacity }}>
                        {situation ? (
                            <>
                                <SituationCard situation={situation} />
                                <InstrumentsStrip
                                    worstRisk={worstRisk}
                                    eventCount={events.length}
                                    coverage={coverage}
                                />
                            </>
                        ) : (
                            <SafetyBanner
                                region={region}
                                worstRisk={worstRisk}
                                eventCount={events.length}
                                summary={summary}
                                coverage={coverage}
                            />
                        )}

                        {events.length > 0 ? (
                            <>
                                <View style={styles.feedHeader}>
                                    <Text style={styles.feedTitle}>Verified alerts</Text>
                                    <Text style={styles.feedSub}>{shortLabel(region) || "Your area"}</Text>
                                </View>
                                {events.map((e) => <EventCard key={e.eventId} event={e} />)}
                            </>
                        ) : null}

                        <CoveragePackPanel coverage={coverage} />
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