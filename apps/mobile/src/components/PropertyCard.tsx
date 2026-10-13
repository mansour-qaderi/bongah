import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { colors, radius, shadow, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  property: Property;
  onPress: () => void;
  /** Extra controls under the card (the "my listings" screen puts its buttons here). */
  footer?: React.ReactNode;
}

export default function PropertyCard({ property, onPress, footer }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const image = property.images[0];

  return (
    <View
      style={[
        styles.card,
        shadow.card,
        property.is_featured && styles.featured,
      ]}
    >
      <Pressable accessibilityRole="button" onPress={onPress}>
        <View style={styles.imageBox}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <AppText variant="title">🏠</AppText>
            </View>
          )}
          {property.is_featured ? (
            <View style={styles.badge}>
              <AppText variant="caption" color={colors.textOnAccent}>
                {t('property.featured')}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <AppText variant="heading" color={colors.primaryDark}>
            {format.price(property.price, property.currency)}
          </AppText>
          <AppText variant="label" numberOfLines={2}>
            {property.title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t(`propertyType.${property.type}`)} ·{' '}
            {t(`dealType.${property.deal_type}`)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {format.area(property.area_sqm)}
            {property.bedrooms !== null
              ? ` · ${formatNumber(property.bedrooms, 0)} ${t(
                  'property.bedrooms',
                )}`
              : ''}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            📍 {format.province(property.province)}، {property.district}
          </AppText>
        </View>
      </Pressable>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featured: { borderColor: colors.accent, borderWidth: 2 },
  imageBox: { height: 170, backgroundColor: colors.primarySoft },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  body: { padding: spacing.md, gap: 2 },
});
