import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/** Which picture: each kind of empty list has its own, so a screen never borrows another one's. */
export type EmptyKind = 'saved' | 'folder' | 'search';

interface Props {
  kind: EmptyKind;
  /** Width in dp; the height follows (every drawing is 160 x 128). */
  width?: number;
}

/**
 * The pictures for "nothing to show", in the app's emerald line style with a dashed gold detail, on a soft grey disc.
 * Decoration only, so assistive tech skips them; the words next to them say what they mean. Drawn on a 160 x 128 grid,
 * in the theme's colours.
 *
 *  - `saved`: a house with an empty (dashed gold) bookmark ribbon beside its roof. Only «ذخیره‌شده‌ها» uses it.
 *  - `folder`: an empty folder with a list inside and a blank gold sheet behind it: «آگهی‌های من», a tab with no listings.
 *  - `search`: a folded map with a dashed route and a magnifying glass: the Home list when a search finds nothing.
 */
export default function EmptyIllustration({ kind, width = 176 }: Props) {
  return (
    <Svg
      width={width}
      height={(width * 128) / 160}
      viewBox="0 0 160 128"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`empty-illustration-${kind}`}
    >
      {kind === 'saved' ? <Saved /> : kind === 'folder' ? <Folder /> : <Search />}
    </Svg>
  );
}

function Saved() {
  return (
    <>
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
    </>
  );
}

function Folder() {
  return (
    <>
      <Circle cx={80} cy={66} r={52} fill={colors.neutralSoft} />
      <Path
        d="M42 106H118"
        stroke={colors.handle}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M92 20H118A4 4 0 0 1 122 24V70H88V24A4 4 0 0 1 92 20Z"
        fill={colors.surface}
        stroke={colors.accentBright}
        strokeWidth={2.6}
        strokeDasharray="4 4"
        strokeLinejoin="round"
      />
      <Path
        d="M44 100V50a4 4 0 0 1 4-4H68l8 9H112a4 4 0 0 1 4 4V100a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4Z"
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <Path
        d="M68 72H102M68 83H102M68 94H90"
        stroke={colors.handle}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={57} cy={72} r={2.6} fill={colors.handle} />
      <Circle cx={57} cy={83} r={2.6} fill={colors.handle} />
      <Circle cx={57} cy={94} r={2.6} fill={colors.handle} />
      <Circle cx={26} cy={44} r={3} fill={colors.handle} />
      <Circle cx={22} cy={78} r={2} fill={colors.handle} />
      <Circle cx={144} cy={88} r={3} fill={colors.handle} />
    </>
  );
}

function Search() {
  return (
    <>
      <Circle cx={80} cy={66} r={52} fill={colors.neutralSoft} />
      <Path
        d="M42 106H118"
        stroke={colors.handle}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M36 52L60 43V93L36 102Z"
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M60 43L88 53V103L60 93Z"
        fill={colors.neutralSoft}
        stroke={colors.primary}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M88 53L116 44V94L88 103Z"
        fill={colors.surface}
        stroke={colors.primary}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path
        d="M46 86Q58 70 72 80T98 66"
        fill="none"
        stroke={colors.accentBright}
        strokeWidth={2.6}
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      <Circle
        cx={104}
        cy={82}
        r={16}
        fill={colors.surface}
        fillOpacity={0.92}
        stroke={colors.primary}
        strokeWidth={3.4}
      />
      <Path
        d="M116 94L130 108"
        stroke={colors.primary}
        strokeWidth={4.4}
        strokeLinecap="round"
      />
      <Circle
        cx={104}
        cy={82}
        r={7}
        fill="none"
        stroke={colors.accentBright}
        strokeWidth={2.4}
        strokeDasharray="3.5 3.5"
      />
      <Circle cx={26} cy={44} r={3} fill={colors.handle} />
      <Circle cx={22} cy={78} r={2} fill={colors.handle} />
      <Circle cx={144} cy={30} r={3} fill={colors.handle} />
    </>
  );
}
