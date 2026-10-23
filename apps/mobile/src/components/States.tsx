import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import AppLoader from './AppLoader';
import AppText from './AppText';
import Button from './Button';

/**
 * What a page, a sheet or a section shows while the data it is made of is on its way: the branded logo loader, with its
 * soft pulse, in the middle of the space. (Lists show skeletons instead; see SkeletonLoader.)
 */
export function LoadingView({ size = 96 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} testID="loading-view">
      <AppLoader size={size} label={t('common.loading')} />
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
        <Button
          icon="refresh"
          title={t('common.retry')}
          variant="outline"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

export function EmptyView({
  message,
  children,
  illustration,
}: {
  message: string;
  children?: React.ReactNode;
  /** A picture above the message (see EmptyIllustration). */
  illustration?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      {illustration}
      <AppText
        variant={illustration ? 'heading' : 'body'}
        color={illustration ? colors.text : colors.textMuted}
        style={styles.text}
      >
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
