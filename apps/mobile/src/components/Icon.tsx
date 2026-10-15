import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { colors } from '../theme';
import {
  ICON_GRID,
  ICON_SHAPES,
  type IconName,
  type Shape,
} from './iconShapes';

export type { IconName } from './iconShapes';

interface Props {
  name: IconName;
  /** Side of the square the icon is drawn in, in dp. */
  size?: number;
  color?: string;
  /** What is behind the icon, for the parts that must hide what is under them (slider knobs, the chat tail). */
  background?: string;
  /** Stroke width in grid units (of 24). Thin by default; heavier for small icons on a coloured badge. */
  weight?: number;
}

const DEFAULT_WEIGHT = 1.7;

/**
 * An icon is a drawing, and a drawing must not mirror with the language. React Native, in a right-to-left layout
 * (this app always is one), flips every left/right thing on the view tree: `left` offsets, left/right border widths
 * and the corner radii (top-left takes the top-right radius, and so on; see BorderRadiusStyle.resolve in
 * react-native's Android sources). Shapes' positions and corners get mirrored but their rotations do not, so a
 * map pin's point or a roof's slope turned sideways. Forcing the direction of the icon's own subtree to
 * left-to-right switches all of that off at once, for every shape and every icon, present and future.
 */
export const ICON_ROOT = { direction: 'ltr' } as const;

/** React Native's style types are read-only; this one is built up field by field. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function shapeStyle(
  shape: Shape,
  unit: number,
  color: string,
  background: string,
  weight: number,
): ViewStyle {
  const style: Mutable<ViewStyle> = {
    position: 'absolute',
    left: shape.x * unit,
    top: shape.y * unit,
    width: shape.w * unit,
    height: shape.h * unit,
  };
  if (shape.r !== undefined) {
    if (typeof shape.r === 'number') {
      style.borderRadius = shape.r * unit;
    } else {
      // Physical corners. They only stay physical because the icon is drawn in a left-to-right subtree (see
      // `ICON_ROOT`): in a right-to-left one React Native hands each corner the radius of its mirror image.
      const [tl, tr, br, bl] = shape.r;
      style.borderTopLeftRadius = tl * unit;
      style.borderTopRightRadius = tr * unit;
      style.borderBottomRightRadius = br * unit;
      style.borderBottomLeftRadius = bl * unit;
    }
  }
  if (shape.stroke) {
    const [top, right, bottom, left] =
      shape.stroke === true ? [1, 1, 1, 1] : shape.stroke;
    style.borderColor = color;
    style.borderTopWidth = top * weight * unit;
    style.borderRightWidth = right * weight * unit;
    style.borderBottomWidth = bottom * weight * unit;
    style.borderLeftWidth = left * weight * unit;
    if (shape.dashed) style.borderStyle = 'dashed';
  }
  if (shape.fill) {
    style.backgroundColor = shape.fill === 'color' ? color : background;
  }
  if (shape.rotate) style.transform = [{ rotate: `${shape.rotate}deg` }];
  return style;
}

/**
 * A line icon drawn from plain views (see iconShapes.ts). Decorative: the control around it carries the
 * accessible name, so the icon is hidden from screen readers.
 */
function IconView({
  name,
  size = 24,
  color = colors.text,
  background = colors.surface,
  weight = DEFAULT_WEIGHT,
}: Props) {
  const unit = size / ICON_GRID;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[ICON_ROOT, { width: size, height: size }]}
    >
      {ICON_SHAPES[name].map((shape, index) => (
        <View
          // The shapes of one icon never change, so the index is a stable key.
          key={index}
          style={shapeStyle(shape, unit, color, background, weight)}
        />
      ))}
    </View>
  );
}

const Icon = React.memo(IconView);
export default Icon;
