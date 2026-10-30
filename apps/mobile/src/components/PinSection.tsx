import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Market } from '@bongah/shared-types';
import { marketName, marketText } from '../i18n/market';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  /** The map itself (LocationEditor). null while the same map is open fullscreen, so only one is drawn. */
  map: React.ReactNode;
  /** The last tap or drop was outside the listing's country. */
  outside?: boolean;
  /** The listing's country, named in the "outside" line. */
  market?: Market;
  error?: string;
  /** What is known about the spot, the drawn plot and the map's buttons. */
  children?: React.ReactNode;
}

/**
 * The "where is it on the map" part of a listing form: one line that says what the map is for, the map in a rounded
 * box, and what is known about the chosen spot. Free for everyone. That one line is the only help text there is: no
 * title above it and no hint under the map.
 */
export default function PinSection({
  map,
  outside = false,
  market,
  error,
  children,
}: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.box}>
      <AppText
        variant="bodySm"
        color={colors.textSecondary}
        testID="location-hint"
      >
        {marketText(t, 'add.locationHint', market)}
      </AppText>
      <View style={styles.map}>{map}</View>
      {outside ? (
        <AppText variant="caption" color={colors.danger}>
          {t('map.outside', { market: marketName(market, t) })}
        </AppText>
      ) : null}
      {children}
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, marginBottom: spacing.lg },
  map: {
    height: 300,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutralSoft,
  },
});
