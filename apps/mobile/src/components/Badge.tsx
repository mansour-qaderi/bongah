import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

/** The look of a badge: a soft tint behind text and an optional dot in the strong colour of the same family. */
export interface BadgeTone {
  /** Background: a pale tint. */
  soft: string;
  /** Text and dot: the strong colour. It reads at 4.5:1 or better on `soft`. */
  strong: string;
}

export const badgeTones = {
  brand: { soft: colors.primaryTint, strong: colors.primaryDark },
  success: { soft: colors.successSoft, strong: colors.successText },
  info: { soft: colors.infoSoft, strong: colors.infoText },
  warning: { soft: colors.accentSoft, strong: colors.accentText },
  danger: { soft: colors.dangerSoft, strong: colors.danger },
  neutral: { soft: colors.neutralSoft, strong: colors.neutralText },
} as const satisfies Record<string, BadgeTone>;

export type BadgeToneName = keyof typeof badgeTones;

interface Props {
  label: string;
  /** A named tone, or a custom pair (the deal colours come in this form). */
  tone?: BadgeToneName | BadgeTone;
  /** A small filled dot before the label: for a status ("active") rather than a category. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A small rounded label: a transaction type, a status, a plan. */
export default function Badge({ label, tone = 'neutral', dot, style }: Props) {
  const { soft, strong } = typeof tone === 'string' ? badgeTones[tone] : tone;
  return (
    <View style={[styles.badge, { backgroundColor: soft }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: strong }]} /> : null}
      <AppText variant="caption" color={strong} style={styles.label}>
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
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontWeight: '600' },
});
