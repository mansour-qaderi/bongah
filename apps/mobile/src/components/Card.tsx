import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, surfaces } from '../theme';
import AppText from './AppText';

interface Props {
  children: React.ReactNode;
  /** A heading inside the card. */
  title?: string;
  /** A quiet line under the heading. */
  hint?: string;
  /**
   * For form cards whose fields bring their own spacing: the card adds none between its children, only under
   * the heading.
   */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one surface every screen builds on: white, 16-point corners, a hairline edge and a soft emerald-tinted
 * shadow. Screens group their content in cards instead of styling their own boxes, so spacing and corners stay
 * the same everywhere.
 */
export default function Card({
  children,
  title,
  hint,
  flush = false,
  style,
}: Props) {
  return (
    <View style={[styles.card, flush ? styles.flush : null, style]}>
      {title ? (
        <View style={[styles.head, flush ? styles.headFlush : null]}>
          <AppText variant="heading">{title}</AppText>
          {hint ? (
            <AppText variant="caption" color={colors.textMuted}>
              {hint}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  flush: { gap: 0 },
  head: { gap: 2 },
  headFlush: { marginBottom: spacing.md },
});
