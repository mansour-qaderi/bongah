import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import { useReducedMotion } from './useReducedMotion';

/** One full turn (ms). */
export const SPINNER_MS = 900;
/** How much of the circle the emerald arc covers (the rest is the grey track). */
export const SPINNER_ARC = 0.3;
/** Default width and height, in points. */
export const SPINNER_SIZE = 40;

interface Props {
  /** Width and height of the spinner, in points. */
  size?: number;
  /** The arc's colour: emerald. White for a spinner that has to sit on a green surface. */
  color?: string;
  /** The track's colour (the full grey ring under the arc). */
  trackColor?: string;
  /** Fill the screen (the app's background behind, the spinner in the middle): the app's start. */
  fullscreen?: boolean;
  /**
   * Lie over the screen that is waiting (a pale veil over it, so it cannot be tapped meanwhile): a request to the
   * server that has to finish before anything else makes sense (sending the code, signing in).
   */
  overlay?: boolean;
  /** What a screen reader says. Pass the translated "loading"; before the languages are loaded there is no text. */
  label?: string;
  /** A short line under the spinner. */
  caption?: string;
  testID?: string;
}

/**
 * The one generic loader of the app: a thin grey ring with a short, round-ended arc of emerald that turns
 * around it. It has no picture in it, no logo and no words, so it can stand anywhere something is on its way: in the
 * middle of a page or a sheet (`LoadingView`), over a screen with a request in flight (`overlay`), or alone while the
 * app starts (`fullscreen`).
 *
 * The turn is one rotation on the native driver, nothing else moves. With "reduce motion" on in the phone the arc
 * stands still at the top of the ring. (Lists load as skeletons, a button or a round control as three dots, and the
 * maps as a pulsing map pin; this is for everything else.)
 */
export default function Spinner({
  size = SPINNER_SIZE,
  color = colors.primary,
  trackColor = colors.border,
  fullscreen = false,
  overlay = false,
  label,
  caption,
  testID,
}: Props) {
  const reduced = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      turn.setValue(0);
      return undefined;
    }
    const spin = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: SPINNER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [reduced, turn]);

  const stroke = Math.max(2.5, Math.round(size * 0.1 * 2) / 2);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={
        fullscreen
          ? styles.fullscreen
          : overlay
          ? styles.overlay
          : styles.inline
      }
      testID={testID ?? 'spinner'}
    >
      <View style={{ width: size, height: size }}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
          />
        </Svg>
        <Animated.View
          testID="spinner-arc"
          style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}
        >
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${
                circumference * SPINNER_ARC
              } ${circumference}`}
              // Start at the top of the ring (12 o'clock) rather than at 3 o'clock.
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
        </Animated.View>
      </View>
      {caption ? (
        <AppText
          variant="bodySm"
          color={colors.textMuted}
          style={styles.caption}
          testID="spinner-caption"
        >
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { alignItems: 'center', justifyContent: 'center' },
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  caption: { marginTop: spacing.md, textAlign: 'center' },
});
