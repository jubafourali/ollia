import { useEffect, useRef, useState } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";

/**
 * Gently cross-fades through a pool of strings. Fade only — no carousel, no
 * horizontal motion. Resets cleanly when the pool changes (e.g. mood shift).
 *
 * @param messages   resolved strings to rotate through
 * @param intervalMs how long each message stays before fading (default ~11s)
 */
export function useRotatingMessage(messages: string[], intervalMs = 11000) {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const opacity = useSharedValue(1);

  // Stable identity for the pool so we only re-init when content actually changes.
  const poolKey = messages.join("");

  useEffect(() => {
    // Reset to the first message of the new pool.
    indexRef.current = 0;
    setIndex(0);
    opacity.value = withTiming(1, { duration: 500 });

    if (messages.length <= 1) return;

    const advance = () => {
      indexRef.current = (indexRef.current + 1) % messages.length;
      setIndex(indexRef.current);
      opacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
    };

    const id = setInterval(() => {
      opacity.value = withTiming(
        0,
        { duration: 700, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) runOnJS(advance)();
        }
      );
    }, intervalMs);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey, intervalMs]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const safeIndex = Math.min(index, Math.max(0, messages.length - 1));

  return { text: messages[safeIndex] ?? "", animatedStyle };
}
