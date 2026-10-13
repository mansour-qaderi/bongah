import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { useAuth } from '../auth/AuthContext';
import { useContactActions } from '../contact/useContactActions';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { PROPERTY_ICONS, useSellerLabel } from '../map/markers';
import { colors, radius, shadow, spacing } from '../theme';
import AppText from './AppText';
import ContactActionBar from './ContactActionBar';
import ContactLockSheet from './ContactLockSheet';

interface Props {
  property: Property;
  /** Open the full details page. */
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The card that slides up over the map when a listing is tapped: picture, price, title, the key facts and,
 * pinned to its bottom edge, Call / WhatsApp / Chat. The actions are the same ones as on the details page
 * (same metering and sign-in rules), because they come from the same hook.
 *
 * Render it with `key={property.id}` so each listing gets its own contact state.
 */
export default function PropertyPreviewCard({
  property,
  onOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user } = useAuth();
  const seller = useSellerLabel()(property);
  const image = property.images[0];

  const actions = useContactActions({
    id: property.id,
    title: property.title,
    user_id: property.user_id,
  });

  const facts = [
    format.area(property.area_sqm),
    property.bedrooms !== null
      ? `${formatNumber(property.bedrooms, 0)} ${t('property.bedrooms')}`
      : null,
    property.bathrooms !== null
      ? `${formatNumber(property.bathrooms, 0)} ${t('property.bathrooms')}`
      : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <View style={[styles.sheet, shadow.card]} testID="property-preview">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.viewDetails')}
        onPress={onOpen}
        style={styles.body}
      >
        <View style={styles.row}>
          <View style={styles.thumb}>
            {image ? (
              <Image
                source={{ uri: image }}
                style={styles.thumbImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <AppText variant="title">{PROPERTY_ICONS[property.type]}</AppText>
            )}
          </View>

          <View style={styles.info}>
            <View style={styles.priceRow}>
              <AppText variant="heading" color={colors.primaryDark}>
                {format.price(property.price, property.currency)}
              </AppText>
              {property.is_featured ? (
                <View style={styles.badge}>
                  <AppText variant="caption" color={colors.textOnAccent}>
                    {t('property.featured')}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="label" numberOfLines={2}>
              {property.title}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t(`propertyType.${property.type}`)} ·{' '}
              {t(`dealType.${property.deal_type}`)}
            </AppText>
            <AppText variant="caption" color={colors.accentText}>
              {property.agency_name ? '🏛️ ' : ''}
              {seller}
            </AppText>
          </View>
        </View>

        <View style={styles.facts}>
          {facts.map(fact => (
            <View key={fact} style={styles.fact}>
              <AppText variant="caption">{fact}</AppText>
            </View>
          ))}
          <View style={styles.fact}>
            <AppText variant="caption" numberOfLines={1}>
              📍 {format.province(property.province)}، {property.district}
            </AppText>
          </View>
        </View>
      </Pressable>

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

      {actions.isOwner ? (
        <AppText
          variant="caption"
          color={colors.textMuted}
          style={styles.owner}
        >
          {t('property.yourListing')}
        </AppText>
      ) : (
        <>
          <ContactActionBar actions={actions} signedIn={user !== null} />
          <ContactLockSheet
            propertyId={property.id}
            visible={actions.sheetOpen}
            quota={actions.quota}
            onClose={actions.closeSheet}
            onUnlocked={actions.finishWanted}
            onResult={actions.remember}
          />
        </>
      )}
    </View>
  );
}

const THUMB = 92;

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  body: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  // Leaves room for the close button on the far edge.
  info: { flex: 1, gap: 2, paddingEnd: spacing.xl },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: colors.accentBright,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fact: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  close: { position: 'absolute', top: spacing.sm, end: spacing.md },
  owner: { textAlign: 'center', padding: spacing.md },
});
