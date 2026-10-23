import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';
import AppText from './AppText';

/**
 * Bongah's mark (Logo 1): a modern house roof with a chimney, and a map pin tucked under it with a round hole, on a
 * soft ring that stands for the ground. Drawn on a 100 x 100 grid and kept as plain data here so the app icon files
 * in `assets/branding` can be checked against it (see `__tests__/logo.test.tsx`).
 *
 * The light comes from the right: the left half of the roof and of the pin is the darker emerald, drawn over the
 * whole shape (so there is no seam between the two tones).
 *
 *  - `roof` / `roofLeft`: the roof band, apex (50, 4.6), eaves at y 36.6; `roofLeft` is its left slope;
 *  - `chimney`: sits on the right slope;
 *  - `pin` / `pinLeft`: a gable-topped pin, apex (50, 16.8), tip (50, 86.7); the hole is a circle at (50, 39.5) r 12.3
 *    cut out of it (`pin` is filled "evenodd"; `pinLeft` has the left half of the hole in its outline);
 *  - `ring`: the ground ring the tip points into.
 */
export const LOGO_GEOMETRY = {
  viewBox: '0 0 100 100',
  roof: 'M50 4.6L90.5 36.6L79.8 36.6L50 13L20.2 36.6L9.5 36.6Z',
  roofLeft: 'M50 4.6L9.5 36.6L20.2 36.6L50 13Z',
  chimney: { x: 67, y: 9.6, width: 8.4, height: 16.4 },
  pin: 'M50 16.8L76.6 37.3C76.6 52 64 72 50 86.7C36 72 23.4 52 23.4 37.3ZM50 27.2A12.3 12.3 0 1 0 50 51.8A12.3 12.3 0 1 0 50 27.2Z',
  pinLeft:
    'M50 16.8L23.4 37.3C23.4 52 36 72 50 86.7L50 51.8A12.3 12.3 0 0 1 50 27.2Z',
  ring: { cx: 50, cy: 87, rx: 26, ry: 8, strokeWidth: 2.6 },
  /** The pin's lowest point (where the animated loaders grow it from, and where the map loader's rings start). */
  tip: { x: 50, y: 86.7 },
} as const;

interface Props {
  /** Width and height of the mark in dp. */
  size?: number;
  /** The emerald of the mark. */
  color?: string;
  /**
   * The darker tone of the left half. Defaults to the theme's deep emerald when `color` is the theme emerald, and to
   * `color` itself (one flat colour) when another colour is given.
   */
  shadeColor?: string;
  /** Draw the ground ring under the pin. On by default; the app icons leave it out. */
  ring?: boolean;
  ringColor?: string;
  /** An optional name written under the mark (for example "بنگاه معاملات"), in Vazirmatn bold. */
  label?: string;
  /** The colour of `label`; the deep emerald by default. */
  labelColor?: string;
  /** What a screen reader says. The label when there is one; the mark alone is otherwise announced as "Bongah". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The Bongah logo. It is an image to assistive tech, with the label as its name. The drawing is symmetric in shape,
 * so it looks the same in right-to-left screens.
 */
export default function Logo({
  size = 96,
  color,
  shadeColor,
  ring = true,
  ringColor = colors.border,
  label,
  labelColor,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const main = color ?? colors.primary;
  const shade = shadeColor ?? (color ? color : colors.primaryDark);
  const { roof, roofLeft, chimney, pin, pinLeft, viewBox } = LOGO_GEOMETRY;
  const ground = LOGO_GEOMETRY.ring;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? label ?? 'Bongah'}
      testID={testID}
      style={[styles.box, style]}
    >
      <Svg width={size} height={size} viewBox={viewBox} testID="logo-mark">
        {ring ? (
          <Ellipse
            cx={ground.cx}
            cy={ground.cy}
            rx={ground.rx}
            ry={ground.ry}
            fill="none"
            stroke={ringColor}
            strokeWidth={ground.strokeWidth}
          />
        ) : null}
        <Path d={roof} fill={main} />
        <Path d={roofLeft} fill={shade} />
        <Rect
          x={chimney.x}
          y={chimney.y}
          width={chimney.width}
          height={chimney.height}
          fill={main}
        />
        <Path d={pin} fill={main} fillRule="evenodd" />
        <Path d={pinLeft} fill={shade} />
      </Svg>
      {label ? (
        <AppText
          testID="logo-label"
          color={labelColor ?? shade}
          style={[
            styles.label,
            {
              fontSize: Math.max(14, Math.round(size * 0.26)),
              lineHeight: Math.max(22, Math.round(size * 0.4)),
              marginTop: Math.round(size * 0.04),
            },
          ]}
        >
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center' },
  // `fontWeight` is turned into the matching Vazirmatn file by AppText (see theme `fonts`).
  label: { fontWeight: '700', textAlign: 'center' },
});
