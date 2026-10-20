import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { useFormat } from '../i18n/useFormat';
import { propertyLineIcon } from '../map/markers';
import { useShareListing } from '../share/listingShare';
import { colors, spacing, surfaces } from '../theme';
import AppText from './AppText';
import Badge, { badgeTones, DealBadge } from './Badge';
import BookmarkButton from './BookmarkButton';
import CircleIconButton from './CircleIconButton';
import Icon from './Icon';
import Price from './Price';
import PropertyFacts, { propertyPlace } from './PropertyFacts';

interface Props {
  property: Property;
  onPress: () => void;
}

const MEDIA_HEIGHT = 188;

/**
 * A listing in the Home list: flat white card with a 1 px border and no shadow.
 *
 * - media: the first picture, or a quiet grey container with the kind's line icon when there is none. The deal
 *   badge sits on it at the start edge (solid emerald for a sale, blue for a rent, gold for a pledge, with the
 *   "featured" badge beside it if the listing is promoted) and the bookmark ribbon at the other edge;
 * - body, top to bottom: the title (the biggest text on the card), the price (the figure with its ؋ sign), the place
 *   with a pin icon, and the facts as a grid, two to a row: the kind and the area above, the bedrooms and the
 *   bathrooms below, each with its own icon. My Listings and the details page show the same four in the same grid;
 * - the corner of the picture at the other edge holds two round buttons, one under the other, in the same white disc:
 *   the bookmark ribbon, and Share, which opens the phone's share sheet (WhatsApp included);
 * - the foot of the card is the listing's description (a few lines, cut with an ellipsis). A listing with no description
 *   shows nothing there at all: the section collapses.
 */
export default function PropertyCard({ property, onPress }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const share = useShareListing();
  const image = property.images[0];

  const place = propertyPlace(property, format.province);
  const description = property.description?.trim() ?? '';

  return (
    <View style={[styles.card, property.is_featured && styles.featured]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={property.title}
        onPress={onPress}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <View style={styles.media}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.placeholder} testID="listing-placeholder">
              <Icon
                name={propertyLineIcon(property.type)}
                size={56}
                color={colors.textMuted}
                background={colors.neutralSoft}
                weight={1.3}
              />
            </View>
          )}
          <View style={styles.badges} pointerEvents="none">
            <DealBadge deal={property.deal_type} />
            {property.is_featured ? (
              <Badge label={t('property.featured')} tone={badgeTones.warning} />
            ) : null}
            {/* Only a saved listing can be shown after its deal (the lists hold live ones): say so. */}
            {property.status === 'SOLD' ? (
              <Badge label={t('status.SOLD')} tone={badgeTones.dark} />
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <AppText variant="heading" numberOfLines={2}>
            {property.title}
          </AppText>
          <Price
            amount={property.price}
            currency={property.currency}
            variant="title"
            color={colors.primary}
            style={styles.price}
          />
          {place ? (
            <View style={styles.place}>
              <Icon
                name="pin"
                size={16}
                color={colors.textSecondary}
                weight={1.9}
              />
              <AppText
                variant="caption"
                color={colors.textSecondary}
                numberOfLines={1}
                style={styles.placeText}
              >
                {place}
              </AppText>
            </View>
          ) : null}
          <PropertyFacts
            property={property}
            withType
            layout="grid"
            divider={false}
          />
          {description ? (
            <AppText
              variant="bodySm"
              color={colors.textSecondary}
              numberOfLines={3}
              style={styles.description}
              testID="card-description"
            >
              {description}
            </AppText>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.corner}>
        <BookmarkButton propertyId={property.id} title={property.title} />
        <CircleIconButton
          testID={`share-${property.id}`}
          icon="share"
          label={`${t('property.share')}: ${property.title}`}
          onPress={() => share(property)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  featured: { borderColor: colors.accentBright },
  pressed: { opacity: 0.85 },
  media: { height: MEDIA_HEIGHT, backgroundColor: colors.neutralSoft },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  // The badges sit at the start edge; the bookmark owns the other one.
  badges: {
    position: 'absolute',
    top: spacing.md,
    start: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  // Top of the picture at the end edge: the bookmark, and the share button under it.
  corner: {
    position: 'absolute',
    top: spacing.md,
    end: spacing.md,
    gap: spacing.sm,
  },
  body: { padding: spacing.lg, gap: spacing.sm },
  price: { lineHeight: 34 },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flexShrink: 1 },
  description: { marginTop: spacing.xs },
});
