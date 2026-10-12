import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';

export function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <AppText style={styles.text}>{message}</AppText>
      {onRetry ? (
        <Button title={t('common.retry')} variant="outline" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function EmptyView({
  message,
  children,
}: {
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <AppText color={colors.textMuted} style={styles.text}>
        {message}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  text: { textAlign: 'center' },
});
