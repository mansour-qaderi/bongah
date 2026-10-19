import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { useAuth } from '../auth/AuthContext';
import { useContactActions } from '../contact/useContactActions';
import { useFormat } from '../i18n/useFormat';
import { propertyTypeLabel } from '../i18n/propertyType';
import { propertyLineIcon, useSellerLabel } from '../map/markers';
import { colors, dealColors, radius, spacing } from '../theme';
import AppText from './AppText';
import { DealBadge } from './Badge';
import ContactActionBar from './ContactActionBar';
import ContactLockSheet from './ContactLockSheet';
import Icon from './Icon';
import Price from './Price';
import PropertyFacts, { propertyPlace } from './PropertyFacts';

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

  return (
    <View style={styles.sheet} testID="property-preview">
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
              <Icon
                name={propertyLineIcon(property.type)}
                size={40}
                color={dealColors[property.deal_type].main}
                background={colors.neutralSoft}
              />
            )}
          </View>

          <View style={styles.info}>
            <View style={styles.priceRow}>
              <Price
                amount={property.price}
                currency={property.currency}
                variant="heading"
                color={colors.primaryDark}
              />
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
            <View style={styles.kindRow}>
              <AppText variant="caption" color={colors.textMuted}>
                {propertyTypeLabel(property.type, t)}
              </AppText>
              <DealBadge deal={property.deal_type} />
            </View>
            <AppText variant="caption" color={colors.accentText}>
              {property.agency_name ? '🏛️ ' : ''}
              {seller}
            </AppText>
          </View>
        </View>

        <View style={styles.facts}>
          <PropertyFacts property={property} />
          <View style={styles.place}>
            <Icon name="pin" size={14} color={colors.textMuted} weight={1.9} />
            <AppText
              variant="caption"
              color={colors.textSecondary}
              numberOfLines={1}
              style={styles.placeText}
            >
              {propertyPlace(property, format.province)}
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
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  body: { padding: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  // Leaves room for the close button on the far edge.
  info: { flex: 1, gap: 2, paddingEnd: spacing.xl },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: colors.accentBright,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  facts: { gap: spacing.sm },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  close: { position: 'absolute', top: spacing.sm, end: spacing.md },
  owner: { textAlign: 'center', padding: spacing.md },
});
