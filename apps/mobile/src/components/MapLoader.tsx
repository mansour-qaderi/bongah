import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { useReducedMotion, waveOf } from './useReducedMotion';

/** One beat of the pin and one pulse on the ground under it (ms). */
export const MAP_LOADER_MS = 1300;
/** How much bigger the pin gets at the top of its beat. */
export const MAP_PIN_PULSE = 1.16;
/** The pin's height, as a share of the loader's size. */
const PIN_HEIGHT = 0.78;
/** Where the pin's tip rests, as a share of the loader's size from the top. */
const TIP_AT = 0.86;
/** The ground pulse is a flat ellipse this much lower than it is wide. */
const GROUND_FLATNESS = 0.3;
const PULSE_PEAK = 0.42;

/**
 * A plain map marker (a drop with a hole in its head), drawn on a 24-unit grid: the head's circle is centred at
 * (12, 9.5) with radius 7, the tip is at (12, 22). This is the generic map-marker shape and nothing of the app's logo.
 */
export const MAP_MARKER_PATH =
  'M12 22C12 22 5 14.8 5 9.5a7 7 0 0 1 14 0C19 14.8 12 22 12 22Z' +
  'M9.3 9.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0Z';
/** The part of the grid the marker occupies: x 5..19, y 2.5..22. */
const CROP = { x: 5, y: 2.5, w: 14, h: 19.5 };

interface Props {
  /** Width and height of the box the pin and its pulses live in. The pin's tip rests near the bottom of it. */
  size?: number;
  /** What a screen reader says; the translated "loading" by default. */
  label?: string;
  /** White instead of green: for a loader on a green (filled) button, where green would vanish. */
  onBrand?: boolean;
  testID?: string;
}

/**
 * The loader of the maps ("finding the way", "looking for the place"): an emerald map marker that pulses, growing a
 * little from its tip and settling again, while a soft ring spreads on the ground under it and fades, twice per beat.
 *
 * The box is square so it can sit in a chip beside a line of words (`size` 24-30), in a route note, or alone in the
 * middle of a waiting map (`size` 88). Transforms and opacity only, on the native driver. With "reduce motion" on,
 * the marker stands still on one faint ring.
 */
export default function MapLoader({
  size = 28,
  label,
  onBrand = false,
  testID,
}: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const beat = useRef(new Animated.Value(0)).current;
  const ground = useRef(new Animated.Value(0)).current;
  const tone = onBrand ? colors.textOnPrimary : colors.primary;

  useEffect(() => {
    if (reduced) {
      beat.setValue(0);
      ground.setValue(0);
      return undefined;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, {
          toValue: 1,
          duration: MAP_LOADER_MS * 0.4,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(beat, {
          toValue: 0,
          duration: MAP_LOADER_MS * 0.6,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const spread = Animated.loop(
      Animated.timing(ground, {
        toValue: 1,
        duration: MAP_LOADER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulse.start();
    spread.start();
    return () => {
      pulse.stop();
      spread.stop();
    };
  }, [reduced, beat, ground]);

  const pinH = size * PIN_HEIGHT;
  const pinW = (pinH * CROP.w) / CROP.h;
  const tipY = size * TIP_AT;
  // The pin grows from its tip: move the tip to the origin, scale, move it back.
  const scale = beat.interpolate({
    inputRange: [0, 1],
    outputRange: [1, MAP_PIN_PULSE],
  });

  const groundW = size;
  const groundH = size * GROUND_FLATNESS;
  const pulses = [0, 0.5].map(offset =>
    waveOf(ground, { offset, from: 0.3, to: 1, peak: PULSE_PEAK }),
  );
  const ringBorder = Math.max(1.5, size * 0.04);
  const groundStyle = {
    left: 0,
    top: tipY - groundH / 2,
    width: groundW,
    height: groundH,
    borderRadius: groundH / 2,
    borderWidth: ringBorder,
    borderColor: tone,
  };

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
      accessibilityState={{ busy: true }}
      style={{ width: size, height: size }}
      testID={testID ?? 'map-loader'}
    >
      {reduced ? (
        <View
          testID="map-loader-still-pulse"
          style={[
            styles.ground,
            groundStyle,
            {
              left: size * 0.15,
              width: size * 0.7,
              height: groundH * 0.7,
              top: tipY - (groundH * 0.7) / 2,
              borderRadius: (groundH * 0.7) / 2,
            },
            styles.stillPulse,
          ]}
        />
      ) : (
        pulses.map((p, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            testID={`map-loader-pulse-${i}`}
            style={[
              styles.ground,
              groundStyle,
              { opacity: p.opacity, transform: [{ scale: p.scale }] },
            ]}
          />
        ))
      )}
      <Animated.View
        pointerEvents="none"
        testID="map-loader-pin"
        style={[
          styles.pin,
          {
            left: (size - pinW) / 2,
            top: tipY - pinH,
            width: pinW,
            height: pinH,
            transform: [
              { translateY: pinH / 2 },
              { scale },
              { translateY: -pinH / 2 },
            ],
          },
        ]}
      >
        <Svg
          width={pinW}
          height={pinH}
          viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
        >
          <Path d={MAP_MARKER_PATH} fill={tone} fillRule="evenodd" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { position: 'absolute' },
  stillPulse: { opacity: 0.25 },
  pin: { position: 'absolute' },
});
