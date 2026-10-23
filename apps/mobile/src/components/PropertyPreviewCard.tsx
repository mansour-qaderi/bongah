import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { useAuth } from '../auth/AuthContext';
import { useContactActions } from '../contact/useContactActions';
import { useFormat } from '../i18n/useFormat';
import { propertyLineIcon, useSellerLabel } from '../map/markers';
import { colors, dealColors, radius, spacing } from '../theme';
import AppText from './AppText';
import Badge, { badgeTones, DealBadge } from './Badge';
import ContactActionBar from './ContactActionBar';
import ContactLockSheet from './ContactLockSheet';
import Icon from './Icon';
import Price from './Price';
import PropertyFacts, { propertyPlace } from './PropertyFacts';import MapLoader from './MapLoader';


interface Props {
  property: Property;
  /** Open the full details page. */
  onOpen: () => void;
  onClose: () => void;
  /**
   * «مسیریابی»: the button in the card that starts directions to this listing. Left out, there is no button (a listing
   * without an exact pin has nowhere to drive to).
   */
  onNavigate?: () => void;
  /** The phone is being located for those directions: the button shows a spinner. */
  navigating?: boolean;
}

/**
 * The card that slides up over the map when a listing is tapped, laid out like a card in «آگهی‌های من» and in this
 * order: the title, the price, the seller directly under the price, with the deal's badge at the far end (the
 * left) and the picture at the start; then the same icon grid of facts; then, pinned to the bottom edge, Call /
 * Chat. The actions are the same ones as on the details page (same metering and sign-in rules), because they come
 * from the same hook.
 *
 * Render it with `key={property.id}` so each listing gets its own contact state.
 */
export default function PropertyPreviewCard({
  property,
  onOpen,
  onClose,
  onNavigate,
  navigating = false,
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
        <View style={styles.row} testID="preview-top">
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

          <View style={styles.info} testID="preview-main">
            <AppText variant="label" numberOfLines={2}>
              {property.title}
            </AppText>
            <Price
              amount={property.price}
              currency={property.currency}
              variant="heading"
              color={colors.primaryDark}
            />
            <AppText
              variant="caption"
              color={colors.accentText}
              numberOfLines={1}
              testID="preview-seller"
            >
              {property.agency_name ? '🏛️ ' : ''}
              {seller}
            </AppText>
          </View>

          {/* The deal's tag at the far end (the top-left corner), the "featured" badge under it. */}
          <View style={styles.tags} testID="preview-tags">
            <DealBadge deal={property.deal_type} />
            {property.is_featured ? (
              <Badge label={t('property.featured')} tone={badgeTones.warning} />
            ) : null}
          </View>
        </View>

        <View style={styles.facts}>
          <PropertyFacts
            property={property}
            withType
            layout="grid"
            divider={false}
          />
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
            {onNavigate ? (
              <Pressable
                testID="preview-navigate"
                accessibilityRole="button"
                accessibilityLabel={t('route.button')}
                accessibilityState={{ busy: navigating, disabled: navigating }}
                disabled={navigating}
                onPress={onNavigate}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.navigate,
                  pressed ? styles.navigatePressed : null,
                ]}
              >
                {navigating ? (
                  <View style={styles.navigateLoader}>
                    <MapLoader size={22} />
                  </View>
                ) : (
                  <Icon
                    name="navigate"
                    size={16}
                    color={colors.primary}
                    weight={1.9}
                  />
                )}
                <AppText variant="label" color={colors.primary}>
                  {t('route.short')}
                </AppText>
              </Pressable>
            ) : null}
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
        <Icon name="close" size={14} color={colors.textSecondary} weight={2} />
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
  info: { flex: 1, gap: 2 },
  tags: { alignItems: 'center', gap: spacing.xs },
  facts: { gap: spacing.sm },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  placeText: { flex: 1 },
  // Directions, at the far end of the place's own line: a small outlined pill in the brand colour.
  navigate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  // The loader's pin hops above its box: the slot is as wide and tall as the arrow icon it stands in for.
  navigateLoader: {
    width: 22,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigatePressed: { opacity: 0.8 },
  // On the picture's corner, so the far end (top-left) is the deal's tag and nothing sits on it.
  close: {
    position: 'absolute',
    top: spacing.sm,
    start: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  owner: { textAlign: 'center', padding: spacing.md },
});
