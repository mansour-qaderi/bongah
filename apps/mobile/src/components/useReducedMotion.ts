import { useEffect, useState } from 'react';
import { AccessibilityInfo, type Animated } from 'react-native';

/**
 * What the phone says about "reduce motion": `undefined` until it has answered (a moment), then true or false, and it
 * keeps following the setting.
 */
function useMotionSetting(): boolean | undefined {
  const [reduced, setReduced] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then(value => {
        if (!cancelled) setReduced(Boolean(value));
      });
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      value => setReduced(Boolean(value)),
    );
    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * True while the phone is set to "reduce motion" (and keeps following the setting). The loaders use it to stop moving:
 * a skeleton stays a flat grey shape, the logo and the map pin stay still. It starts as `true`: nothing moves until the
 * phone has said that motion is fine (a moment, not a visible delay), so someone who asked for less motion never sees
 * even one frame of it.
 */
export function useReducedMotion(): boolean {
  return useMotionSetting() ?? true;
}

/**
 * Like `useReducedMotion`, but says "I do not know yet" (`undefined`) instead of guessing. For a transition that starts
 * the moment something appears and so has to know whether to play at all (the fade from a loader to the data).
 */
export function useReducedMotionKnown(): boolean | undefined {
  return useMotionSetting();
}

/**
 * A wave that grows out of a point and fades, read off one value `progress` that runs 0 → 1 over and over. `offset`
 * (0..1) starts the wave part-way round, so two waves on the same value follow one another instead of moving together.
 * Both numbers are plain interpolations of `progress`, so they run on the native driver.
 */
export function waveOf(
  progress: Animated.Value,
  {
    offset = 0,
    from,
    to,
    peak,
  }: {
    offset?: number;
    from: number;
    to: number;
    peak: number;
  },
) {
  // The wave's own phase p = (progress + offset) mod 1. Where that wraps, two input points sit a hair apart so the
  // jump from "gone" back to "new" is instant and never seen (the opacity is 0 on both sides of it).
  const wrap = offset === 0 ? null : 1 - offset;
  const at = (p: number) => ({
    scale: from + (to - from) * p,
    opacity: peak * (1 - p),
  });
  const inputs: number[] = [];
  const scales: number[] = [];
  const opacities: number[] = [];
  const push = (input: number, p: number) => {
    inputs.push(input);
    scales.push(at(p).scale);
    opacities.push(at(p).opacity);
  };
  if (wrap === null) {
    push(0, 0);
    push(1, 1);
  } else {
    push(0, offset);
    push(wrap - 0.0001, 1);
    push(wrap, 0);
    push(1, offset);
  }
  return {
    scale: progress.interpolate({ inputRange: inputs, outputRange: scales }),
    opacity: progress.interpolate({
      inputRange: inputs,
      outputRange: opacities,
    }),
  };
}
