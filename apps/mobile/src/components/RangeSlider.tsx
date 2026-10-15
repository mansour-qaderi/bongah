import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { colors } from '../theme';

const THUMB = 28;
const TRACK = 6;

/** The index of the stop nearest to a value; `fallback` when there is no value (no limit). */
export function nearestStop(
  stops: readonly number[],
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  let best = 0;
  for (let i = 1; i < stops.length; i += 1) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
}

interface Props {
  /** Ascending values the thumbs stop at. The first means "no lower limit", the last "no upper limit". */
  stops: readonly number[];
  low: number | undefined;
  high: number | undefined;
  /** An undefined end means that end is not limited. */
  onChange: (low: number | undefined, high: number | undefined) => void;
  /** How a value is read out to a screen reader. */
  describe: (value: number | undefined) => string;
  lowLabel: string;
  highLabel: string;
}

/**
 * A two-thumb range slider with no native dependency. The thumbs follow the finger smoothly and settle on the
 * nearest stop with a spring; the stops are uneven on purpose (prices are not linear), which is why it works in
 * stops and not raw numbers. In a right-to-left language the low end is at the right.
 *
 * The slider is drawn in a left-to-right subtree so its pixel maths is the same in every language; only the
 * mapping from a stop to a position is mirrored.
 */
export default function RangeSlider({
  stops,
  low,
  high,
  onChange,
  describe,
  lowLabel,
  highLabel,
}: Props) {
  const last = stops.length - 1;
  const rtl = I18nManager.isRTL;
  const [width, setWidth] = useState(0);
  const usable = Math.max(0, width - THUMB);

  const lowIndex = Math.min(nearestStop(stops, low, 0), last - 1);
  const highIndex = Math.max(nearestStop(stops, high, last), lowIndex + 1);

  const xFor = (index: number) => {
    const f = index / last;
    return (rtl ? 1 - f : f) * usable;
  };

  const lowX = useRef(new Animated.Value(0)).current;
  const highX = useRef(new Animated.Value(0)).current;
  const dragging = useRef<'low' | 'high' | null>(null);

  // Everything the gesture handlers need, kept current without rebuilding them.
  const live = useRef({ lowIndex, highIndex, usable, last, rtl, onChange });
  live.current = { lowIndex, highIndex, usable, last, rtl, onChange };
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  // Move the thumbs to the values they are given (typed, cleared, or changed by the other control).
  useEffect(() => {
    if (usable === 0 || dragging.current) return;
    Animated.spring(lowX, {
      toValue: xFor(lowIndex),
      useNativeDriver: false,
      stiffness: 300,
      damping: 28,
    }).start();
    Animated.spring(highX, {
      toValue: xFor(highIndex),
      useNativeDriver: false,
      stiffness: 300,
      damping: 28,
    }).start();
    // xFor reads usable, rtl and last, all of which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowIndex, highIndex, usable, rtl, last, lowX, highX]);

  const makeResponder = (which: 'low' | 'high') => {
    let startX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // A scroll view around the slider must not take the gesture away mid-drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragging.current = which;
        const {
          lowIndex: l,
          highIndex: h,
          usable: u,
          last: n,
          rtl: r,
        } = live.current;
        const index = which === 'low' ? l : h;
        const f = index / n;
        startX = (r ? 1 - f : f) * u;
      },
      onPanResponderMove: (_e, g) => {
        const {
          lowIndex: l,
          highIndex: h,
          usable: u,
          last: n,
          rtl: r,
        } = live.current;
        const indexOf = (x: number) => {
          const f = u > 0 ? Math.min(1, Math.max(0, x / u)) : 0;
          return Math.round((r ? 1 - f : f) * n);
        };
        const posOf = (index: number) => (r ? 1 - index / n : index / n) * u;
        const raw = Math.min(u, Math.max(0, startX + g.dx));
        const index =
          which === 'low'
            ? Math.min(indexOf(raw), h - 1)
            : Math.max(indexOf(raw), l + 1);
        // Follow the finger, but never past the other thumb. Which side "past" is on depends on the direction:
        // the low thumb must stay on the low side of the high one, and the low side is the right in RTL.
        const limit = which === 'low' ? posOf(h - 1) : posOf(l + 1);
        const mustStayBelow = (which === 'low') !== r;
        const x = mustStayBelow ? Math.min(raw, limit) : Math.max(raw, limit);
        (which === 'low' ? lowX : highX).setValue(x);
        const nextLow = which === 'low' ? index : l;
        const nextHigh = which === 'high' ? index : h;
        if (nextLow !== l || nextHigh !== h) {
          const s = stopsRef.current;
          live.current.onChange(
            nextLow === 0 ? undefined : s[nextLow],
            nextHigh === n ? undefined : s[nextHigh],
          );
        }
      },
      onPanResponderRelease: () => {
        dragging.current = null;
        const {
          lowIndex: l,
          highIndex: h,
          usable: u,
          last: n,
          rtl: r,
        } = live.current;
        const posOf = (index: number) => (r ? 1 - index / n : index / n) * u;
        Animated.spring(lowX, {
          toValue: posOf(l),
          useNativeDriver: false,
          stiffness: 300,
          damping: 26,
        }).start();
        Animated.spring(highX, {
          toValue: posOf(h),
          useNativeDriver: false,
          stiffness: 300,
          damping: 26,
        }).start();
      },
      onPanResponderTerminate: () => {
        dragging.current = null;
      },
    });
  };
  const lowResponder = useMemo(() => makeResponder('low'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const highResponder = useMemo(() => makeResponder('high'), []); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (which: 'low' | 'high', delta: number) => {
    const nextLow = which === 'low' ? lowIndex + delta : lowIndex;
    const nextHigh = which === 'high' ? highIndex + delta : highIndex;
    if (nextLow < 0 || nextHigh > last || nextLow >= nextHigh) return;
    onChange(
      nextLow === 0 ? undefined : stops[nextLow],
      nextHigh === last ? undefined : stops[nextHigh],
    );
  };

  const actions = [
    { name: 'increment' as const },
    { name: 'decrement' as const },
  ];
  const adjustable = (which: 'low' | 'high', index: number) => ({
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: which === 'low' ? lowLabel : highLabel,
    accessibilityValue: {
      text: describe(
        which === 'low'
          ? index === 0
            ? undefined
            : stops[index]
          : index === last
          ? undefined
          : stops[index],
      ),
    },
    accessibilityActions: actions,
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      const up = event.nativeEvent.actionName === 'increment';
      // "Up" always means a bigger price, whichever side of the track that is on.
      step(which, up ? 1 : -1);
    },
  });

  // The coloured part between the thumbs.
  const fillLeft = Animated.add(rtl ? highX : lowX, THUMB / 2);
  const fillWidth = rtl
    ? Animated.subtract(lowX, highX)
    : Animated.subtract(highX, lowX);

  return (
    <View
      style={styles.root}
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
    >
      <View style={styles.track} />
      {width > 0 ? (
        <>
          <Animated.View
            testID="range-fill"
            style={[styles.fill, { left: fillLeft, width: fillWidth }]}
          />
          <Animated.View
            testID="range-low"
            {...lowResponder.panHandlers}
            {...adjustable('low', lowIndex)}
            hitSlop={12}
            style={[styles.thumb, { transform: [{ translateX: lowX }] }]}
          />
          <Animated.View
            testID="range-high"
            {...highResponder.panHandlers}
            {...adjustable('high', highIndex)}
            hitSlop={12}
            style={[styles.thumb, { transform: [{ translateX: highX }] }]}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Left-to-right, so left/right mean what they say whatever the language (see the component's note).
  root: { direction: 'ltr', height: THUMB + 8, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: colors.border,
  },
  fill: {
    position: 'absolute',
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: '#064E3B',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
