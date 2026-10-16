import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DealType } from '@bongah/shared-types';
import { colors, dealColors, radius, spacing } from '../theme';
import AppText from './AppText';

/**
 * The look of a badge. Badges are flat: a solid fill with its ink on top, or white with a 1 px border. There
 * are no pastel tints. `border` is only set for the white ones.
 */
export interface BadgeTone {
  /** Background: a solid colour, or white. */
  bg: string;
  /** Text and dot. It reads at 4.5:1 or better on `bg`. */
  fg: string;
  /** The 1 px edge of a white badge. Solid badges have none. */
  border?: string;
}

export const badgeTones = {
  /** Solid emerald: a running status, a plan. */
  brand: { bg: colors.primary, fg: colors.textOnPrimary },
  success: { bg: colors.primary, fg: colors.textOnPrimary },
  /** Solid blue. */
  info: { bg: colors.info, fg: colors.textOnPrimary },
  /** Solid gold with dark ink (white on gold fails contrast). */
  warning: { bg: colors.accentBright, fg: colors.textOnAccent },
  /** Near-black: a finished deal. */
  dark: { bg: colors.ink, fg: colors.textOnPrimary },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
  neutral: {
    bg: colors.surface,
    fg: colors.neutralText,
    border: colors.border,
  },
} as const satisfies Record<string, BadgeTone>;

export type BadgeToneName = keyof typeof badgeTones;

/**
 * What a deal looks like: `solid` is the filled pill (emerald sale, blue rent, gold growi) for sitting on a
 * picture; `outline` is white with a 1 px edge and a dot in the deal's colour, for a row where a solid green
 * badge would be confused with a "live" status.
 */
export function dealTone(
  deal: DealType,
  style: 'solid' | 'outline' = 'solid',
): BadgeTone {
  const { main, on } = dealColors[deal];
  if (style === 'solid') return { bg: main, fg: on };
  return { bg: colors.surface, fg: colors.text, border: colors.border };
}

interface Props {
  label: string;
  /** A named tone, or a custom one. */
  tone?: BadgeToneName | BadgeTone;
  /** A small filled dot before the label: for a status ("active") rather than a category. */
  dot?: boolean;
  /** Overrides the dot's colour (the deal's own colour on an outline badge). */
  dotColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** A small rounded label: a transaction type, a status, a plan. */
export default function Badge({
  label,
  tone = 'neutral',
  dot,
  dotColor,
  style,
}: Props) {
  const { bg, fg, border } =
    typeof tone === 'string' ? (badgeTones[tone] as BadgeTone) : tone;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg },
        border ? { borderColor: border } : null,
        style,
      ]}
    >
      {dot ? (
        <View style={[styles.dot, { backgroundColor: dotColor ?? fg }]} />
      ) : null}
      <AppText variant="caption" color={fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    // Solid badges have no edge colour, so their border is invisible (transparent) and takes no extra size.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontWeight: '600' },
});
