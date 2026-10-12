import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

type Kind = 'error' | 'success' | 'info';

const palette: Record<Kind, { bg: string; fg: string }> = {
  error: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: colors.success },
  info: { bg: colors.primarySoft, fg: colors.primaryDark },
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
  const { bg, fg } = palette[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.box, { backgroundColor: bg }]}
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
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
});
