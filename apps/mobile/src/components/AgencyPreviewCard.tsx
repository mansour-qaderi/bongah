import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AgencyMapPin } from '@bongah/shared-types';
import { formatNumber } from '../i18n/format';
import { colors, radius, shadow, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  agency: AgencyMapPin;
  onClose: () => void;
}

/**
 * A verified office tapped on the map: name, address and how many listings it has right now. Its phone number
 * is not public (there is nothing to call from here); people reach it through its listings.
 */
export default function AgencyPreviewCard({ agency, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[styles.sheet, shadow.card]} testID="agency-preview">
      <View style={styles.icon}>
        <AppText variant="title">🏛️</AppText>
      </View>
      <View style={styles.info}>
        <AppText variant="heading" color={colors.primaryDark} numberOfLines={2}>
          {agency.agency_name}
        </AppText>
        <AppText variant="caption" color={colors.primary}>
          ✓ {t('home.agencyVerified')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
          📍 {agency.address}
        </AppText>
        <AppText variant="label" color={colors.accentText}>
          {agency.active_listings > 0
            ? t('home.agencyListings', {
                count: formatNumber(agency.active_listings, 0),
              })
            : t('home.agencyNoListings')}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        hitSlop={12}
        style={styles.close}
      >
        <AppText variant="heading" color={colors.textMuted}>
          ×
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2, paddingEnd: spacing.xl },
  close: { position: 'absolute', top: spacing.sm, end: spacing.md },
});
