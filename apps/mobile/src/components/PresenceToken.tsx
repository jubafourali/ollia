import React from "react";
import { View } from "react-native";
import Svg, {
  Circle, Defs, RadialGradient, Stop, ClipPath, Rect, G, Ellipse,
} from "react-native-svg";

type HintPreset = {
  headY: number; headR: number; headScaleY: number;
  bodyY: number; bodyScaleX: number;
  hOp: [number, number, number];
  bOp: [number, number, number];
};

const HINT: Record<string, HintPreset> = {
  Mom:      { headY:0.13, headR:0.34, headScaleY:1.22, bodyY:0.46, bodyScaleX:1.78, hOp:[0.80,0.44,0.06], bOp:[0.68,0.34,0.00] },
  Dad:      { headY:0.11, headR:0.34, headScaleY:1.06, bodyY:0.48, bodyScaleX:1.62, hOp:[0.76,0.40,0.06], bOp:[0.62,0.30,0.00] },
  Daughter: { headY:0.18, headR:0.30, headScaleY:1.14, bodyY:0.50, bodyScaleX:1.40, hOp:[0.70,0.36,0.05], bOp:[0.54,0.24,0.00] },
  Son:      { headY:0.11, headR:0.32, headScaleY:1.08, bodyY:0.49, bodyScaleX:1.54, hOp:[0.74,0.38,0.06], bOp:[0.58,0.26,0.00] },
  Sister:   { headY:0.17, headR:0.31, headScaleY:1.14, bodyY:0.50, bodyScaleX:1.44, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
  Brother:  { headY:0.12, headR:0.32, headScaleY:1.10, bodyY:0.49, bodyScaleX:1.56, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
  Grandma:  { headY:0.12, headR:0.33, headScaleY:1.20, bodyY:0.45, bodyScaleX:1.82, hOp:[0.74,0.40,0.06], bOp:[0.60,0.30,0.00] },
  Grandpa:  { headY:0.11, headR:0.33, headScaleY:1.08, bodyY:0.47, bodyScaleX:1.64, hOp:[0.72,0.38,0.06], bOp:[0.58,0.28,0.00] },
  Partner:  { headY:0.13, headR:0.33, headScaleY:1.16, bodyY:0.48, bodyScaleX:1.58, hOp:[0.78,0.42,0.06], bOp:[0.64,0.32,0.00] },
  Aunt:     { headY:0.15, headR:0.32, headScaleY:1.18, bodyY:0.47, bodyScaleX:1.62, hOp:[0.74,0.38,0.05], bOp:[0.58,0.28,0.00] },
  Uncle:    { headY:0.11, headR:0.33, headScaleY:1.08, bodyY:0.49, bodyScaleX:1.58, hOp:[0.72,0.38,0.05], bOp:[0.56,0.26,0.00] },
  Niece:    { headY:0.20, headR:0.28, headScaleY:1.10, bodyY:0.52, bodyScaleX:1.32, hOp:[0.64,0.32,0.04], bOp:[0.48,0.20,0.00] },
  Nephew:   { headY:0.19, headR:0.28, headScaleY:1.08, bodyY:0.52, bodyScaleX:1.36, hOp:[0.64,0.32,0.04], bOp:[0.48,0.20,0.00] },
  Friend:   { headY:0.13, headR:0.31, headScaleY:1.12, bodyY:0.49, bodyScaleX:1.50, hOp:[0.68,0.34,0.05], bOp:[0.52,0.24,0.00] },
  default:  { headY:0.13, headR:0.32, headScaleY:1.14, bodyY:0.49, bodyScaleX:1.52, hOp:[0.74,0.40,0.06], bOp:[0.60,0.30,0.00] },
};

type Props = {
  relation: string;
  pinColor: string;
  size?: number;
  ringColor?: string;
  showRing?: boolean;
};

export function PresenceToken({ relation, pinColor, size = 48, ringColor, showRing = false }: Props) {
  const r   = size / 2;
  const cx  = r;
  const cy  = r;
  const h   = HINT[relation] ?? HINT.default;
  // Unique id suffix to avoid SVG gradient ID collisions across multiple tokens
  const uid = `${relation.replace(/\W/g, "_")}_${size}`;

  const headCy = cy - r * h.headY;
  const headRx = r * h.headR;
  const headRy = r * h.headR * h.headScaleY;
  const bodyCy = cy + r * h.bodyY;
  const bodyRx = r * 0.40 * h.bodyScaleX;
  const bodyRy = r * 0.40 * 0.72;

  const ring  = ringColor ?? pinColor;
  const pad   = showRing ? 5 : 0;
  const total = size + pad * 2;
  const ox    = pad;
  const oy    = pad;

  return (
      <View style={{ width: total, height: total }}>
        <Svg width={total} height={total}>
          <Defs>
            <ClipPath id={`clip_${uid}`}>
              <Circle cx={cx + ox} cy={cy + oy} r={r} />
            </ClipPath>

            {/* Orb base — warm cream, off-center highlight */}
            <RadialGradient id={`base_${uid}`} cx="38%" cy="36%" r="128%" fx="38%" fy="36%">
              <Stop offset="0%"   stopColor="#fffcf7" stopOpacity="1" />
              <Stop offset="18%"  stopColor="#fdf4e8" stopOpacity="1" />
              <Stop offset="46%"  stopColor="#f0ddc0" stopOpacity="1" />
              <Stop offset="76%"  stopColor="#d8c09a" stopOpacity="1" />
              <Stop offset="100%" stopColor="#bea070" stopOpacity="1" />
            </RadialGradient>

            {/* Pin color wash */}
            <RadialGradient id={`tint_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor={pinColor} stopOpacity="0.13" />
              <Stop offset="100%" stopColor={pinColor} stopOpacity="0.13" />
            </RadialGradient>

            {/* Head silhouette */}
            <RadialGradient id={`head_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#481804" stopOpacity={h.hOp[0]} />
              <Stop offset="38%"  stopColor="#481804" stopOpacity={h.hOp[1]} />
              <Stop offset="70%"  stopColor="#481804" stopOpacity={h.hOp[2]} />
              <Stop offset="100%" stopColor="#481804" stopOpacity="0" />
            </RadialGradient>

            {/* Shoulder silhouette */}
            <RadialGradient id={`body_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#481804" stopOpacity={h.bOp[0]} />
              <Stop offset="36%"  stopColor="#481804" stopOpacity={h.bOp[1]} />
              <Stop offset="70%"  stopColor="#481804" stopOpacity={h.bOp[2]} />
              <Stop offset="100%" stopColor="#481804" stopOpacity="0" />
            </RadialGradient>

            {/* Specular highlight — top-left glass shine */}
            <RadialGradient id={`hl_${uid}`} cx="35%" cy="32%" r="100%" fx="35%" fy="32%">
              <Stop offset="0%"   stopColor="#ffffff" stopOpacity="0.74" />
              <Stop offset="22%"  stopColor="#ffffff" stopOpacity="0.28" />
              <Stop offset="48%"  stopColor="#ffffff" stopOpacity="0.07" />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </RadialGradient>

            {/* Rim vignette */}
            <RadialGradient id={`rim_${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="62%"  stopColor="#371c06" stopOpacity="0" />
              <Stop offset="100%" stopColor="#371c06" stopOpacity="0.38" />
            </RadialGradient>
          </Defs>

          {/* Status ring outside orb */}
          {showRing && (
              <Circle
                  cx={cx + ox} cy={cy + oy} r={r + 3}
                  fill="none" stroke={ring} strokeWidth={2.5} opacity={0.85}
              />
          )}

          <G clipPath={`url(#clip_${uid})`}>
            <Rect x={ox} y={oy} width={size} height={size} fill={`url(#base_${uid})`} />
            <Rect x={ox} y={oy} width={size} height={size} fill={`url(#tint_${uid})`} />
            <Ellipse cx={cx + ox} cy={headCy + oy} rx={headRx} ry={headRy} fill={`url(#head_${uid})`} />
            <Ellipse cx={cx + ox} cy={bodyCy + oy} rx={bodyRx} ry={bodyRy} fill={`url(#body_${uid})`} />
            <Rect x={ox} y={oy} width={size} height={size} fill={`url(#hl_${uid})`} />
            <Rect x={ox} y={oy} width={size} height={size} fill={`url(#rim_${uid})`} />
          </G>
        </Svg>
      </View>
  );
}