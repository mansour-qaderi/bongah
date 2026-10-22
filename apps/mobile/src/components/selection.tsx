import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

/** How long the filled pill takes to arrive at (and leave) a tab. */
export const SELECT_MS = 220;

/**
 * 0 while a tab is not chosen and 1 while it is, eased between the two whenever `selected` changes. One value drives
 * everything that moves with the choice (the fill, the label's ink, a count's capsule), so they cannot drift apart.
 * It is driven from JavaScript because colours cannot use the native driver; a tab is a handful of small views.
 */
export function useSelection(selected: boolean): Animated.Value {
  const value = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const first = useRef(true);
  useEffect(() => {
    // The first draw is already where it belongs: only a change moves.
    if (first.current) {
      first.current = false;
      return;
    }
    const motion = Animated.timing(value, {
      toValue: selected ? 1 : 0,
      duration: SELECT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    motion.start();
    return () => motion.stop();
  }, [selected, value]);
  return value;
}

/** A colour that goes from `from` (not chosen) to `to` (chosen) with the selection. */
export const inkBetween = (
  value: Animated.Value,
  from: string,
  to: string,
): Animated.AnimatedInterpolation<string> =>
  value.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

/**
 * The pill that fills a chosen tab: it grows from 88% and fades in on the tab being chosen, and shrinks and fades out
 * on the one being left, so the highlight seems to pass from one tab to the other. It lies behind the tab's content and
 * takes its corners from `radius`. A fade and a scale have no left or right, so right-to-left needs nothing special.
 */
export function SelectionFill({
  value,
  radius,
  color = colors.primary,
  style,
}: {
  value: Animated.Value;
  radius: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      testID="selection-fill"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          backgroundColor: color,
          opacity: value,
          transform: [
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
          ],
        },
        style,
      ]}
    />
  );
}
