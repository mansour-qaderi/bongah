import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

interface Props {
  /** Width in dp; the height follows (the drawing is 160 x 128). */
  width?: number;
}

/**
 * The picture for "nothing saved yet": a house in the app's emerald line style with an empty (dashed gold)
 * bookmark ribbon beside its roof. It is decoration only, so assistive tech skips it; the words next to it say what
 * it means. Drawn on a 160 x 128 grid, in the theme's colours.
 */
export default function EmptyIllustration({ width = 176 }: Props) {
  return (
    <Svg
      width={width}
      height={(width * 128) / 160}
      viewBox="0 0 160 128"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="empty-illustration"
    >
      <Circle cx={80} cy={66} r={52} fill={colors.neutralSoft} />
      <Path
        d="M42 106H118"
        stroke={colors.handle}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Rect
        x={48}
        y={62}
        width={64}
        height={44}
        rx={4}
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={3}
      />
      <Path
        d="M40 65L80 32L120 65"
        fill="none"
        stroke={colors.primary}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        x={52}
        y={38}
        width={8}
        height={16}
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Rect
        x={71}
        y={82}
        width={18}
        height={24}
        rx={3}
        fill={colors.neutralSoft}
        stroke={colors.primary}
        strokeWidth={2.6}
      />
      <Rect
        x={55}
        y={72}
        width={11}
        height={11}
        rx={2}
        fill={colors.neutralSoft}
        stroke={colors.primary}
        strokeWidth={2.2}
      />
      <Rect
        x={94}
        y={72}
        width={11}
        height={11}
        rx={2}
        fill={colors.neutralSoft}
        stroke={colors.primary}
        strokeWidth={2.2}
      />
      <Path
        d="M122 14H140A4 4 0 0 1 144 18V58L131 49L118 58V18A4 4 0 0 1 122 14Z"
        fill={colors.surface}
        stroke={colors.accentBright}
        strokeWidth={2.6}
        strokeDasharray="4 4"
        strokeLinejoin="round"
      />
      <Circle cx={26} cy={44} r={3} fill={colors.handle} />
      <Circle cx={22} cy={78} r={2} fill={colors.handle} />
      <Circle cx={144} cy={88} r={3} fill={colors.handle} />
    </Svg>
  );
}
