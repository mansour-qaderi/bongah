import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Logo, { LOGO_GEOMETRY } from './Logo';
import { useReducedMotion, waveOf } from './useReducedMotion';

/** One breath of the pin, and one wave of the ring (ms). They run on the same clock, so the wave leaves as the pin settles. */
export const APP_LOADER_MS = 1700;
/** How much bigger the pin gets at the top of its breath. Small on purpose: a gentle swell, not a bounce. */
export const PIN_SWELL = 1.06;
/** How far the waves travel (times the ring's own size) before they are gone. */
const WAVE_REACH = 1.75;
const WAVE_PEAK = 0.34;
/** The ground shadow's opacity at the bottom and at the top of the breath, and when it stands still. */
const SHADOW_MIN = 0.07;
const SHADOW_MAX = 0.2;
const SHADOW_STILL = 0.12;

interface Props {
  /** Width and height of the mark, in points. */
  size?: number;
  /** Fill the screen (white behind, the mark in the middle): the app's start. */
  fullscreen?: boolean;
  /**
   * Lie over the screen that is waiting (a pale veil over it, so it cannot be tapped meanwhile): a request to the
   * server that has to finish before anything else makes sense (sending the code, signing in).
   */
  overlay?: boolean;
  /** What a screen reader says. Pass the translated "loading"; before the languages are loaded there is only the name. */
  label?: string;
  /** A short line under the mark. */
  caption?: string;
  testID?: string;
}

/**
 * The branded loader: the Bongah mark (roof, chimney and the green house-pin), standing on its ground ring.
 *
 *  - the pin swells very slightly and settles again (`PIN_SWELL`), growing from its tip, so it never leaves the ring;
 *  - a soft green shadow on the ground inside the ring pulses with it (darker and wider as the pin swells);
 *  - from the ring, two soft waves of green widen and fade, one after the other, as if the pin were sending out a ping.
 *
 * Everything is a transform or an opacity on the native driver. With "reduce motion" switched on in the phone the mark
 * simply stands on its ring, still. The geometry is the logo's own (`LOGO_GEOMETRY`), so this is always the same mark as
 * the splash screen's.
 *
 * Three sizes of use: inline (the default, wherever it is put), `fullscreen` (the app's start: the languages and the
 * session are being loaded) and `overlay` (over a screen with a request in flight).
 */
export default function AppLoader({
  size = 112,
  fullscreen = false,
  overlay = false,
  label,
  caption,
  testID,
}: Props) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      breath.setValue(0);
      wave.setValue(0);
      return undefined;
    }
    const swell = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: APP_LOADER_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: APP_LOADER_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const ping = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: APP_LOADER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    swell.start();
    ping.start();
    return () => {
      swell.stop();
      ping.stop();
    };
  }, [reduced, breath, wave]);

  const k = size / 100;
  const { ring, tip } = LOGO_GEOMETRY;
  const stroke = ring.strokeWidth * k;
  // The ring's box, so a wave can grow from its centre (a transform scales a view about its middle).
  const ringW = (ring.rx * 2 + ring.strokeWidth) * k;
  const ringH = (ring.ry * 2 + ring.strokeWidth) * k;
  const ringLeft = (ring.cx - ring.rx - ring.strokeWidth / 2) * k;
  const ringTop = (ring.cy - ring.ry - ring.strokeWidth / 2) * k;

  // The pin grows from its tip: move the tip to the origin, scale, move it back.
  const tipY = (tip.y - 50) * k;
  const swell = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1, PIN_SWELL],
  });

  // The soft shadow on the ground inside the ring: it breathes with the pin (a little darker and wider as the pin swells).
  const groundOpacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [SHADOW_MIN, SHADOW_MAX],
  });
  const groundScale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.06],
  });

  const waves = [0, 0.5].map(offset =>
    waveOf(wave, { offset, from: 1, to: WAVE_REACH, peak: WAVE_PEAK }),
  );

  const mark = (
    <View style={{ width: size, height: size }}>
      {/* The ring the pin stands on: always there, the waves are what move. */}
      <Svg
        width={size}
        height={size}
        viewBox={LOGO_GEOMETRY.viewBox}
        style={StyleSheet.absoluteFill}
      >
        <Ellipse
          cx={ring.cx}
          cy={ring.cy}
          rx={ring.rx}
          ry={ring.ry}
          fill="none"
          stroke={colors.border}
          strokeWidth={ring.strokeWidth}
        />
      </Svg>
      <Animated.View
        pointerEvents="none"
        testID="app-loader-shadow"
        style={[
          styles.wave,
          {
            left: ringLeft,
            top: ringTop,
            width: ringW,
            height: ringH,
            opacity: reduced ? SHADOW_STILL : groundOpacity,
            transform: [{ scale: reduced ? 1 : groundScale }],
          },
        ]}
      >
        <Svg width={ringW} height={ringH}>
          <Ellipse
            cx={ringW / 2}
            cy={ringH / 2}
            rx={ring.rx * k * 0.86}
            ry={ring.ry * k * 0.8}
            fill={colors.primary}
          />
        </Svg>
      </Animated.View>
      {reduced
        ? null
        : waves.map((w, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              testID={`app-loader-wave-${i}`}
              style={[
                styles.wave,
                {
                  left: ringLeft,
                  top: ringTop,
                  width: ringW,
                  height: ringH,
                  opacity: w.opacity,
                  transform: [{ scale: w.scale }],
                },
              ]}
            >
              <Svg width={ringW} height={ringH}>
                <Ellipse
                  cx={ringW / 2}
                  cy={ringH / 2}
                  rx={ring.rx * k}
                  ry={ring.ry * k}
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={stroke}
                />
              </Svg>
            </Animated.View>
          ))}
      <Animated.View
        testID="app-loader-pin"
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { translateY: tipY },
              { scale: swell },
              { translateY: -tipY },
            ],
          },
        ]}
      >
        <Logo size={size} ring={false} accessibilityLabel={label ?? 'Bongah'} />
      </Animated.View>
    </View>
  );

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Bongah'}
      accessibilityState={{ busy: true }}
      style={
        fullscreen
          ? styles.fullscreen
          : overlay
          ? styles.overlay
          : styles.inline
      }
      testID={testID ?? 'app-loader'}
    >
      {mark}
      {caption ? (
        <AppText
          variant="bodySm"
          color={colors.textMuted}
          style={styles.caption}
          testID="app-loader-caption"
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
  wave: { position: 'absolute' },
  caption: { marginTop: spacing.md, textAlign: 'center' },
});
