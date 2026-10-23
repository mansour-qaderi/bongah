import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { useReducedMotion } from './useReducedMotion';

/** One pulse of a dot, up and back (ms), and the delay between one dot and the next. */
export const INLINE_LOADER_MS = 640;
const STAGGER_MS = 150;
const DOTS = [0, 1, 2];

interface Props {
  /** Height of the box; the three dots and the gaps between them fill about its width. */
  size?: number;
  /** The dots' colour: the text colour of the button they stand in. */
  color?: string;
  /** What a screen reader says; the translated "loading" by default. */
  label?: string;
  testID?: string;
}

/**
 * The small busy sign for the inside of a button, a round control or a line of text: three dots that swell and fade in
 * turn. It takes the place of the system spinner, as tall as it was (`size`), in the colour it is given.
 *
 * Opacity and scale only, on the native driver. With "reduce motion" on the three dots simply stand there, half-faded.
 */
export default function InlineLoader({
  size = 20,
  color = colors.primary,
  label,
  testID,
}: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const dots = useRef(DOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduced) {
      dots.forEach(dot => dot.setValue(0));
      return undefined;
    }
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * STAGGER_MS),
          Animated.timing(dot, {
            toValue: 1,
            duration: INLINE_LOADER_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: INLINE_LOADER_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((DOTS.length - 1 - i) * STAGGER_MS),
        ]),
      ),
    );
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [reduced, dots]);

  const d = Math.max(4, Math.round(size * 0.26));
  const gap = Math.max(2, Math.round(size * 0.16));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
      accessibilityState={{ busy: true }}
      style={[styles.row, { height: size, gap }]}
      testID={testID ?? 'inline-loader'}
    >
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          testID={`inline-loader-dot-${i}`}
          style={[
            {
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
            },
            dotMotion(dot, reduced),
          ]}
        />
      ))}
    </View>
  );
}

/** How one dot moves: faded and small at rest, full and a little bigger at the top of its pulse. */
function dotMotion(dot: Animated.Value, reduced: boolean) {
  if (reduced) return { opacity: 0.55 };
  return {
    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        scale: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0.75, 1.15],
        }),
      },
    ],
  };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
