import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

type Kind = 'error' | 'success' | 'info' | 'promo';

/** Flat: white, a 1 px edge and ink in the kind's colour. No pastel fills. */
const palette: Record<Kind, { border: string; fg: string }> = {
  error: { border: colors.danger, fg: colors.danger },
  success: { border: colors.primary, fg: colors.primary },
  info: { border: colors.border, fg: colors.textSecondary },
  // An invitation, not a fault ("upgrade to post more"): the brand green edge with dark green words.
  promo: { border: colors.primary, fg: colors.primaryDark },
};

export default function Banner({
  kind = 'info',
  message,
  children,
}: {
  kind?: Kind;
  message: string;
  children?: React.ReactNode;
}) {
  const { border, fg } = palette[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.box, { borderColor: border }]}
    >
      <AppText variant="label" color={fg}>
        {message}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
});
