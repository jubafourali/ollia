import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import BRAND from "@/constants/colors";
import { WorldBackdrop } from "./WorldBackdrop";
import { PresenceNode } from "./PresenceNode";
import { getRegionPosition, SELF_POSITION } from "@/utils/regionPosition";

export type WorldMember = {
  id: string;
  initial: string;
  region: string;
  ringColor: string;
};

type Props = {
  members: WorldMember[];
  selfInitial: string;
  selfRingColor: string;
  highlightedId?: string | null;
  onSelectMember: (id: string) => void;
  height?: number;
};

const MEMBER_SIZE = 48;
const SELF_SIZE = 58;

/**
 * The Living World Hero — the emotional centre of Ollia. "You" rest warmly in the
 * middle; the people you care about appear around you as living presence nodes,
 * joined by barely-there connection threads. Approximate, symbolic, never a map.
 */
export function LivingWorldHero({
  members,
  selfInitial,
  selfRingColor,
  highlightedId,
  onSelectMember,
  height = 340,
}: Props) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && w !== width) setWidth(w);
  };

  const selfPx = SELF_POSITION.x * width;
  const selfPy = SELF_POSITION.y * height;

  const placed = members.map((m) => {
    const pos = getRegionPosition(m.region, m.id);
    return { ...m, px: pos.x * width, py: pos.y * height };
  });

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {width > 0 && (
        <>
          <WorldBackdrop width={width} height={height} />

          {/* Connection threads — static, barely visible warmth from you to each */}
          <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
            {placed.map((m) => {
              const mx = (selfPx + m.px) / 2 + (m.py - selfPy) * 0.18;
              const my = (selfPy + m.py) / 2 - (m.px - selfPx) * 0.18;
              return (
                <Path
                  key={m.id}
                  d={`M ${selfPx} ${selfPy} Q ${mx} ${my}, ${m.px} ${m.py}`}
                  stroke={BRAND.primary}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.08}
                />
              );
            })}
          </Svg>

          {/* Presence nodes */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {placed.map((m, i) => {
              const halo = MEMBER_SIZE * 1.9;
              return (
                <View
                  key={m.id}
                  style={{ position: "absolute", left: m.px - halo / 2, top: m.py - halo / 2 }}
                >
                  <PresenceNode
                    initial={m.initial}
                    ringColor={m.ringColor}
                    index={i}
                    size={MEMBER_SIZE}
                    highlighted={highlightedId === m.id}
                    onPress={() => onSelectMember(m.id)}
                  />
                </View>
              );
            })}

            {/* "You" — the warm centre */}
            <View
              style={{
                position: "absolute",
                left: selfPx - (SELF_SIZE * 1.9) / 2,
                top: selfPy - (SELF_SIZE * 1.9) / 2,
              }}
            >
              <PresenceNode
                initial={selfInitial}
                ringColor={selfRingColor}
                index={0}
                size={SELF_SIZE}
                isSelf
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 28,
  },
});
