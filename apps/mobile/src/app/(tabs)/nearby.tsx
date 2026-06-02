import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
    Animated,
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
import { api } from "@/utils/api";
import type { ApiNearbyMember } from "@/utils/api";

// ── Risk config ───────────────────────────────────────────────────────────────

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
        <Animated.View style={{ opacity, marginBottom: 24 }}>
            <View style={sk.header} />
            <View style={sk.card} />
            <View style={[sk.card, { marginTop: 8, opacity: 0.5 }]} />
        </Animated.View>
    );
}

const sk = StyleSheet.create({
    header: {
        height: 16, width: "40%", borderRadius: 8,
        backgroundColor: BRAND.borderLight, marginBottom: 10,
    },
    card: {
        height: 90, borderRadius: 14,
        backgroundColor: BRAND.backgroundCard,
        borderWidth: 1, borderColor: BRAND.borderLight,
    },
});

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event }: { event: ApiNearbyMember["events"][number] }) {
    const color = RISK_COLOR[event.riskLevel] ?? "#6B7280";
    const icon  = RISK_ICON[event.riskLevel]  ?? "info";
    const label = RISK_LABEL[event.riskLevel] ?? "Low concern";

    return (
        <View style={[ec.card, { borderColor: `${color}40`, backgroundColor: `${color}08` }]}>
            {/* Header row */}
            <View style={ec.header}>
                <View style={[ec.iconWrap, { backgroundColor: `${color}18` }]}>
                    <Feather name={icon as any} size={14} color={color} />
                </View>
                <Text style={[ec.eventLabel, { color }]} numberOfLines={1}>
                    {event.eventLabel}
                </Text>
            </View>

            {/* Sentence */}
            <Text style={ec.sentence}>{event.sentence}</Text>

            {/* Footer */}
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
    card: {
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, marginBottom: 8, gap: 8,
    },
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

// ── Quiet card ────────────────────────────────────────────────────────────────

function QuietCard({ name, isMe }: { name: string; isMe: boolean }) {
    return (
        <View style={qc.card}>
            <View style={qc.dot} />
            <Text style={qc.text}>Quiet nearby · Nothing to flag around {isMe ? "your" : `${name}'s`} area today</Text>
        </View>
    );
}

const qc = StyleSheet.create({
    card: {
        flexDirection: "row", alignItems: "center", gap: 10,
        backgroundColor: `${BRAND.statusGreen}08`,
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: `${BRAND.statusGreen}30`, marginBottom: 8,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.statusGreen },
    text: { fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, flex: 1, lineHeight: 18 },
});

// ── Member section ────────────────────────────────────────────────────────────

function MemberSection({ member }: { member: ApiNearbyMember }) {
    const [expanded, setExpanded] = useState(false);
    const MAX_VISIBLE = 2;
    const hasMore = member.events.length > MAX_VISIBLE;
    const visible = expanded ? member.events : member.events.slice(0, MAX_VISIBLE);
    const hiddenCount = member.events.length - MAX_VISIBLE;
    const locationLabel = member.region ? member.region.split(",")[0].trim() : "their area";

    return (
        <View style={ms.section}>
            {/* Header */}
            <View style={ms.header}>
                <View style={ms.avatar}>
                    <Text style={ms.avatarText}>{member.name[0]?.toUpperCase() ?? "?"}</Text>
                </View>
                <View>
                    <Text style={ms.name}>{member.isMe ? "Around me" : `Around ${member.name}`}</Text>
                    <Text style={ms.location}>{locationLabel}</Text>
                </View>
            </View>

            {/* Events or quiet */}
            {member.events.length === 0 ? (
                <QuietCard name={member.name} isMe={member.isMe} />
            ) : (
                <>
                    {visible.map((event) => (
                        <EventCard key={event.eventId} event={event} />
                    ))}
                    {hasMore && !expanded && (
                        <Pressable
                            style={({ pressed }) => [ms.seeMore, pressed && { opacity: 0.7 }]}
                            onPress={() => {
                                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setExpanded(true);
                            }}
                        >
                            <Text style={ms.seeMoreText}>
                                See {hiddenCount} more {hiddenCount === 1 ? "event" : "events"}
                            </Text>
                            <Feather name="chevron-down" size={14} color={BRAND.primary} />
                        </Pressable>
                    )}
                </>
            )}
        </View>
    );
}

const ms = StyleSheet.create({
    section: { marginBottom: 24 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    avatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: `${BRAND.primary}18`,
        alignItems: "center", justifyContent: "center",
        borderWidth: 1.5, borderColor: `${BRAND.primary}40`,
    },
    avatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: BRAND.primaryDark },
    name:     { fontSize: 15, fontFamily: "Inter_600SemiBold", color: BRAND.text },
    location: { fontSize: 12, fontFamily: "Inter_400Regular", color: BRAND.textMuted, marginTop: 1 },
    seeMore: {
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
        paddingVertical: 11, borderRadius: 14,
        borderWidth: 1.5, borderStyle: "dashed", borderColor: `${BRAND.primary}60`,
        marginBottom: 8,
    },
    seeMoreText: { fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.primary },
});

// ── Empty state ───────────────────────────────────────────────────────────────

function NoCircleState() {
    return (
        <View style={styles.empty}>
            <Feather name="users" size={48} color={BRAND.border} />
            <Text style={styles.emptyTitle}>No one in your circle yet</Text>
            <Text style={styles.emptyText}>
                Invite family members to start seeing what's happening around them.
            </Text>
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NearbyScreen() {
    const insets = useSafeAreaInsets();
    const { refreshSafetyEvents: refreshAlerts } = useFamilyContext();
    const [nearbyData, setNearbyData] = useState<ApiNearbyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const topInset = Platform.OS === "web" ? 67 : insets.top;

    const fetchNearby = useCallback(async () => {
        try {
            const data = await api.getNearby();
            setNearbyData(data);
        } catch (e) {
            console.warn("getNearby failed:", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchNearby(); }, [fetchNearby]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Promise.all([fetchNearby(), refreshAlerts()]);
    }, [fetchNearby, refreshAlerts]);

    return (
        <View style={[styles.container, { paddingTop: topInset }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Nearby</Text>
                <Text style={styles.subtitle}>
                    {loading ? "Checking..." : "What's happening around your circle"}
                </Text>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
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
                {/* Trust banner */}
                <View style={styles.trustBanner}>
                    <View style={styles.trustPulse}>
                        <View style={[styles.trustPulseInner, { backgroundColor: BRAND.statusGreen }]} />
                    </View>
                    <Text style={styles.trustText}>
                        Ollia is quietly watching over everyone
                    </Text>
                </View>

                {loading ? (
                    <>
                        <SkeletonSection />
                        <SkeletonSection />
                    </>
                ) : nearbyData.length === 0 ? (
                    <NoCircleState />
                ) : (
                    nearbyData.map((m) => <MemberSection key={m.memberId} member={m} />)
                )}
            </ScrollView>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container:  { flex: 1, backgroundColor: BRAND.background },
    header: {
        flexDirection: "column", paddingHorizontal: 20, paddingBottom: 12,
    },
    title:    { fontSize: 28, fontFamily: "Inter_700Bold", color: BRAND.text },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, marginTop: 2 },
    scroll:   { flex: 1 },
    content:  { paddingHorizontal: 20, paddingTop: 4 },

    trustBanner: {
        flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20,
        backgroundColor: `${BRAND.statusGreen}12`, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: `${BRAND.statusGreen}30`,
    },
    trustPulse: {
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: `${BRAND.statusGreen}40`,
        alignItems: "center", justifyContent: "center",
    },
    trustPulseInner: { width: 6, height: 6, borderRadius: 3 },
    trustText: { fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND.statusGreen, flex: 1 },

    empty:      { alignItems: "center", paddingTop: 48, gap: 12 },
    emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: BRAND.text, marginTop: 8 },
    emptyText:  { fontSize: 14, fontFamily: "Inter_400Regular", color: BRAND.textSecondary, textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },
});