import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { LOGO_GEOMETRY } from './Logo';
import { useReducedMotion, waveOf } from './useReducedMotion';

/** One hop of the pin and one radar ring (ms). */
export const MAP_LOADER_MS = 1500;
/** How high the pin jumps, as a share of the loader's size. */
const HOP = 0.12;
/** The pin's height, as a share of the loader's size. */
const PIN_HEIGHT = 0.46;
const RING_PEAK = 0.5;

// The pin, cropped from the logo's own drawing (hole, two emerald tones): x 20..80, y 14..90 of the 100 grid.
const CROP = { x: 20, y: 14, w: 60, h: 76 };
const { pin, pinLeft, tip } = LOGO_GEOMETRY;

interface Props {
  /** Width and height of the box the pin and its rings live in. The rings reach its edge; the pin hops above its middle. */
  size?: number;
  /** What a screen reader says; the translated "loading" by default. */
  label?: string;
  /** White instead of green: for a loader on a green (filled) button, where green would vanish. */
  onBrand?: boolean;
  testID?: string;
}

/**
 * A small "looking for you / finding the way" indicator for the maps: the map pin (the logo's pin, without its roof)
 * hops up and lands on a spot, and from that spot two radar rings widen and fade, one after the other.
 *
 * The box is square and the spot is its middle, so it can sit in a chip beside a line of words (`size` 24-30), in a
 * route note, or alone in the middle of a waiting map (`size` 88). Transforms and opacity only, on the native driver.
 * With "reduce motion" on, the pin stands still on one faint ring.
 */
export default function MapLoader({
  size = 28,
  label,
  onBrand = false,
  testID,
}: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const hop = useRef(new Animated.Value(0)).current;
  const radar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      hop.setValue(0);
      radar.setValue(0);
      return undefined;
    }
    // Up fast, down a little slower, a small rebound, then a rest while the ring finishes.
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0.3,
          duration: 130,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hop, {
          toValue: 0,
          duration: 130,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(MAP_LOADER_MS - 880),
      ]),
    );
    const rings = Animated.loop(
      Animated.timing(radar, {
        toValue: 1,
        duration: MAP_LOADER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    bounce.start();
    rings.start();
    return () => {
      bounce.stop();
      rings.stop();
    };
  }, [reduced, hop, radar]);

  const pinH = size * PIN_HEIGHT;
  const pinW = (pinH * CROP.w) / CROP.h;
  // The pin's tip rests on the middle of the box.
  const tipFromTop = ((tip.y - CROP.y) / CROP.h) * pinH;
  const lift = size * HOP;
  const rise = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] });
  // The little shadow on the spot shrinks while the pin is up.
  const shadow = hop.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.55],
  });

  const rings = [0, 0.5].map(offset =>
    waveOf(radar, { offset, from: 0.2, to: 1, peak: RING_PEAK }),
  );
  const ringBorder = Math.max(1.5, size * 0.035);

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
          testID="map-loader-still-ring"
          style={[
            styles.ring,
            {
              width: size * 0.7,
              height: size * 0.7,
              borderRadius: size * 0.35,
              left: size * 0.15,
              top: size * 0.15,
              borderWidth: ringBorder,
            },
            styles.stillRing,
            onBrand ? { borderColor: colors.textOnPrimary } : null,
          ]}
        />
      ) : (
        rings.map((r, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            testID={`map-loader-ring-${i}`}
            style={[
              styles.ring,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: ringBorder,
                borderColor: onBrand ? colors.textOnPrimary : colors.primary,
                opacity: r.opacity,
                transform: [{ scale: r.scale }],
              },
            ]}
          />
        ))
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            width: size * 0.2,
            height: size * 0.06,
            borderRadius: size * 0.03,
            left: size * 0.4,
            top: size / 2 - size * 0.03,
            transform: [{ scaleX: shadow }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        testID="map-loader-pin"
        style={[
          styles.pin,
          {
            left: (size - pinW) / 2,
            top: size / 2 - tipFromTop,
            transform: [{ translateY: rise }],
          },
        ]}
      >
        <Svg
          width={pinW}
          height={pinH}
          viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
        >
          <Path
            d={pin}
            fill={onBrand ? colors.textOnPrimary : colors.primary}
            fillRule="evenodd"
          />
          <Path
            d={pinLeft}
            fill={onBrand ? colors.textOnPrimary : colors.primaryDark}
            fillOpacity={onBrand ? 0.7 : 1}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderColor: colors.primary },
  stillRing: { opacity: 0.25 },
  pin: { position: 'absolute' },
  shadow: { position: 'absolute', backgroundColor: colors.ink, opacity: 0.16 },
});
