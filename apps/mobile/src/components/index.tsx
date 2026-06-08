import React, {
  useCallback, useEffect, useRef, useState,
} from "react";
import {
  Animated, Easing, LayoutChangeEvent,
  Pressable, StyleSheet, Text, View,
} from "react-native";
import Svg, {
  Circle, Ellipse, Defs, RadialGradient, Stop,
} from "react-native-svg";
import { PresenceToken } from "./PresenceToken";
import { ResolvedPin, GlobeMember } from "./types";
import {
  resolveMembers, formatLastSeen, STATUS_LABEL,
  STATUS_PIN_COLOR, restingRotation, projectLatLng,
  STATUS_BREATH,
} from "./globeUtils";
import BRAND from "@/constants/colors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

const GLOBE_H          = 260;
const AUTO_ROT_DEG     = 0.18;   // degrees per tick (~30fps)
const INERTIA_DECAY    = 0.90;
const INERTIA_THRESH   = 0.001;
const INERTIA_RESUME_MS = 1800;
const PANEL_H          = 220;
const TICK_MS          = 33;     // ~30fps

// ── SVG Globe ──────────────────────────────────────────────────────────────
function GlobeSvg({ w, h, rotY }: { w: number; h: number; rotY: number }) {
  const cx  = w / 2;
  const cy  = h / 2;
  const R   = Math.min(w, h) / 2 * 0.88;
  const D2R = Math.PI / 180;

  // Latitude rings — always horizontal, just shift vertically
  const latRings = [-60, -30, 0, 30, 60].map(lat => {
    const phi   = lat * D2R;
    const rx    = R * Math.cos(phi);
    const ry    = rx * 0.07;
    const y     = cy - R * Math.sin(phi);
    return { key: lat, cx, y, rx, ry, strong: lat === 0 };
  });

  // Longitude arcs — 6 great circles, shift by rotY
  const lngArcs = [0, 30, 60, 90, 120, 150].map(base => {
    const shifted = ((base - rotY) % 180 + 180) % 180;
    const factor  = Math.cos(shifted * D2R);     // -1 → 1
    const rx      = Math.abs(factor) * R;
    const flip    = factor < 0;
    return { key: base, cx, cy, rx, ry: R, flip };
  });

  return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="gGrad" cx="42%" cy="35%" r="60%">
            <Stop offset="0%"   stopColor="#fdf4e8" />
            <Stop offset="52%"  stopColor="#f0d9aa" />
            <Stop offset="100%" stopColor="#b8723a" stopOpacity="0.95" />
          </RadialGradient>
          <RadialGradient id="atmGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="78%"  stopColor="#f59e0b" stopOpacity="0" />
            <Stop offset="100%" stopColor="#f59e0b" stopOpacity="0.16" />
          </RadialGradient>
          <RadialGradient id="shineGrad" cx="36%" cy="28%" r="40%">
            <Stop offset="0%"   stopColor="#ffffff" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Atmosphere glow */}
        <Circle cx={cx} cy={cy} r={R + 10} fill="url(#atmGrad)" />

        {/* Globe body */}
        <Circle cx={cx} cy={cy} r={R} fill="url(#gGrad)" />

        {/* Longitude arcs */}
        {lngArcs.map(l => (
            <Ellipse
                key={l.key}
                cx={l.cx} cy={l.cy}
                rx={l.rx} ry={l.ry}
                fill="none"
                stroke="#c8a86a"
                strokeWidth={0.6}
                strokeOpacity={0.22}
            />
        ))}

        {/* Latitude rings */}
        {latRings.map(l => (
            <Ellipse
                key={l.key}
                cx={l.cx} cy={l.y}
                rx={l.rx} ry={l.ry}
                fill="none"
                stroke="#c8a86a"
                strokeWidth={l.strong ? 0.9 : 0.6}
                strokeOpacity={l.strong ? 0.40 : 0.22}
            />
        ))}

        {/* Specular shine */}
        <Circle cx={cx} cy={cy} r={R} fill="url(#shineGrad)" />
      </Svg>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────
type Props = {
  members: GlobeMember[];
  meRegion?: string;
};

// ── Component ──────────────────────────────────────────────────────────────
export function FamilyGlobe({ members, meRegion }: Props) {
  const [glSize, setGlSize]     = useState({ w: 320, h: GLOBE_H });
  const [pins, setPins]         = useState<ResolvedPin[]>([]);
  const [selected, setSelected] = useState<ResolvedPin | null>(null);
  const [panelAnim]             = useState(() => new Animated.Value(0));
  const [breathAnims]           = useState<Record<string, Animated.Value>>({});
  const [rotDeg, setRotDeg]     = useState({ y: 0, x: 0 });
  const [pinScreenPos, setPinScreenPos] = useState<Record<string, { x: number; y: number; visible: boolean }>>({});

  const pinsRef       = useRef<ResolvedPin[]>([]);
  const glSizeRef     = useRef({ w: 320, h: GLOBE_H });
  const rotRef        = useRef({ y: 0, x: 0 });
  const velRef        = useRef({ y: 0, x: 0 });
  const isDragging    = useRef(false);
  const lastTouch     = useRef<{ x: number; y: number } | null>(null);
  const lastDragEnd   = useRef(0);
  const animRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Resolve members → pins ──────────────────────────────────────────────
  useEffect(() => {
    const resolved = resolveMembers(members, meRegion);
    setPins(resolved);
    pinsRef.current = resolved;
    const [lng, lat] = restingRotation(resolved);
    rotRef.current = { y: lng, x: lat };
  }, [members, meRegion]);

  // ── Breath animations ───────────────────────────────────────────────────
  useEffect(() => {
    pins.forEach(p => {
      if (!breathAnims[p.id]) {
        const av = new Animated.Value(0);
        breathAnims[p.id] = av;
        const cfg = STATUS_BREATH[p.status] ?? STATUS_BREATH.inactive;
        Animated.loop(
            Animated.sequence([
              Animated.timing(av, { toValue: 1, duration: cfg.period / 2, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
              Animated.timing(av, { toValue: 0, duration: cfg.period / 2, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
            ])
        ).start();
      }
    });
  }, [pins]);

  // ── Animation loop ──────────────────────────────────────────────────────
  useEffect(() => {
    animRef.current = setInterval(() => {
      const rot = rotRef.current;
      const vel = velRef.current;

      if (!isDragging.current) {
        const hasInertia = Math.abs(vel.y) > INERTIA_THRESH || Math.abs(vel.x) > INERTIA_THRESH;
        if (hasInertia) {
          rot.y += vel.y;
          rot.x  = Math.max(-70, Math.min(70, rot.x + vel.x));
          velRef.current = { y: vel.y * INERTIA_DECAY, x: vel.x * INERTIA_DECAY };
        } else if (Date.now() - lastDragEnd.current > INERTIA_RESUME_MS) {
          rot.y += AUTO_ROT_DEG;
        }
      }

      // Project pins
      const { w: W, h: H } = glSizeRef.current;
      const proj: Record<string, { x: number; y: number; visible: boolean }> = {};
      for (const p of pinsRef.current) {
        proj[p.id] = projectLatLng(
            p.lat, p.lng,
            -rot.y, -rot.x,
            W / 2, H / 2,
            (Math.min(W, H) / 2) * 0.88,
        );
      }
      setPinScreenPos(proj);
      setRotDeg({ y: rot.y, x: rot.x });
    }, TICK_MS);

    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  // ── Touch handlers ──────────────────────────────────────────────────────
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
    rotRef.current.y += dx * 0.35;
    rotRef.current.x  = Math.max(-70, Math.min(70, rotRef.current.x + dy * 0.35));
    velRef.current    = { y: dx * 0.25, x: dy * 0.25 };
    lastTouch.current = { x: t.pageX, y: t.pageY };
  }, []);

  const onTouchEnd = useCallback(() => {
    isDragging.current  = false;
    lastTouch.current   = null;
    lastDragEnd.current = Date.now();
  }, []);

  // ── Pin tap ─────────────────────────────────────────────────────────────
  const onPinTap = useCallback((pin: ResolvedPin) => {
    setSelected(pin);
    Animated.spring(panelAnim, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
  }, [panelAnim]);

  const closePanel = useCallback(() => {
    Animated.timing(panelAnim, {
      toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic),
    }).start(() => setSelected(null));
  }, [panelAnim]);

  // ── Layout ──────────────────────────────────────────────────────────────
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setGlSize({ w: width, h: GLOBE_H });
    glSizeRef.current = { w: width, h: GLOBE_H };
  }, []);

  const panelTranslate = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [PANEL_H + 20, 0] });
  const panelOpacity   = panelAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 1] });
  const hasPins        = pins.length > 0;

  return (
      <View style={styles.wrapper} onLayout={onLayout}>
        {/* ── Globe area ── */}
        <View
            style={[styles.globeWrap, { width: glSize.w, height: GLOBE_H }]}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
        >
          <GlobeSvg w={glSize.w} h={GLOBE_H} rotY={rotDeg.y} />

          {/* ── Pin overlays ── */}
          {pins.map(pin => {
            const pos = pinScreenPos[pin.id];
            if (!pos?.visible) return null;
            const TOKEN_SIZE = 34;
            const halfToken  = TOKEN_SIZE / 2 + 5;
            return (
                <Pressable
                    key={pin.id}
                    style={[styles.pinWrap, { left: pos.x - halfToken, top: pos.y - halfToken }]}
                    onPress={() => onPinTap(pin)}
                    hitSlop={10}
                >
                  {breathAnims[pin.id] ? (
                      <Animated.View style={{
                        opacity: breathAnims[pin.id].interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.0] }),
                        transform: [{ scale: breathAnims[pin.id].interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.06] }) }],
                      }}>
                        <PresenceToken
                            relation={pin.relation}
                            pinColor={STATUS_PIN_COLOR[pin.status] ?? "#9ca3af"}
                            size={TOKEN_SIZE}
                            showRing={pin.status === "active" || pin.status === "recent"}
                            ringColor={STATUS_PIN_COLOR[pin.status]}
                        />
                      </Animated.View>
                  ) : (
                      <PresenceToken
                          relation={pin.relation}
                          pinColor={STATUS_PIN_COLOR[pin.status] ?? "#9ca3af"}
                          size={TOKEN_SIZE}
                          showRing={pin.status === "active" || pin.status === "recent"}
                          ringColor={STATUS_PIN_COLOR[pin.status]}
                      />
                  )}
                </Pressable>
            );
          })}

          {!hasPins && (
              <View style={styles.emptyHint} pointerEvents="none">
                <Text style={styles.emptyHintText}>Pins appear once members set their city</Text>
              </View>
          )}
        </View>

        {/* ── Member detail panel ── */}
        {selected && (
            <Animated.View style={[styles.panel, { transform: [{ translateY: panelTranslate }], opacity: panelOpacity }]}>
              <View style={styles.panelHandle} />

              <View style={styles.panelRow}>
                <PresenceToken
                    relation={selected.relation}
                    pinColor={STATUS_PIN_COLOR[selected.status] ?? "#9ca3af"}
                    size={52}
                    showRing
                    ringColor={STATUS_PIN_COLOR[selected.status]}
                />
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
                  <Feather name="arrow-right" size={14} color={BRAND.white} />
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

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0d0905",
    borderWidth: 1,
    borderColor: `${BRAND.primary}28`,
  },
  globeWrap: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#0d0905",
  },
  pinWrap: {
    position: "absolute",
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  emptyHintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,248,235,0.38)",
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
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: BRAND.borderLight ?? "#F0E2C4",
    alignSelf: "center",
    marginBottom: 14,
  },
  panelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  panelInfo: { flex: 1, gap: 2 },
  panelName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: BRAND.text,
  },
  panelRelation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textSecondary,
  },
  panelLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  panelLocation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
  },
  panelStatusWrap: {
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  panelMeta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${BRAND.primary}08`,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${BRAND.primary}18`,
  },
  metaItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: BRAND.textMuted,
  },
  metaValue: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.textSecondary,
  },
  metaDivider: {
    width: 1, height: 24,
    backgroundColor: `${BRAND.primary}20`,
    marginHorizontal: 10,
  },
  panelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  viewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: BRAND.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  viewBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: BRAND.white ?? "#fff",
  },
  closeBtn: {
    width: 42, height: 42,
    borderRadius: 21,
    backgroundColor: `${BRAND.primary}12`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${BRAND.primary}28`,
  },
});