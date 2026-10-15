import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  AgencyMapPin,
  Property,
  PropertyType,
} from '@bongah/shared-types';
import AppText from '../components/AppText';
import Icon, { type IconName } from '../components/Icon';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { colors, dealColors, radius, shadow, spacing } from '../theme';

/** A glyph per kind of property for places that still draw text (list rows, the picture-less thumbnail). */
export const PROPERTY_ICONS: Record<PropertyType, string> = {
  APARTMENT: '🏢',
  HOUSE_HAWILI: '🏠',
  LAND: '🏞️',
  OFFICE_SHOP: '🏬',
  GARDEN_VILLA: '🏡',
  GARAGE_OTHER: '🚗',
};

/** The line icon for each kind of property: what the marker shows, so the type reads before the price does. */
export const PROPERTY_LINE_ICONS: Record<PropertyType, IconName> = {
  APARTMENT: 'apartment',
  HOUSE_HAWILI: 'house',
  LAND: 'land',
  OFFICE_SHOP: 'shop',
  GARDEN_VILLA: 'villa',
  GARAGE_OTHER: 'garage',
};

/** Who is selling, for a marker: the agency's name, or "owner" for a private seller. */
export function useSellerLabel() {
  const { t } = useTranslation();
  return (property: Pick<Property, 'agency_name'>) =>
    property.agency_name ?? t('property.owner');
}

/** Ink for the things that are not a listing (clusters), so they never compete with the deal colours. */
const INK = colors.ink;
const WHITE = '#FFFFFF';

const BADGE = 38;
const HALO = 56;
const TAG_MAX_WIDTH = 150;

/** A small downward point under a badge, so its tip marks the exact spot. */
function Tail({ color }: { color: string }) {
  return <View style={[styles.tail, { backgroundColor: color }]} />;
}

/**
 * A listing. The badge is a coloured disc: the colour says what it is offered for (emerald = sale, blue =
 * rent, gold = growi) and the white line icon says what it is (flat, house, plot, shop, villa). The price
 * appears above it once the map is close enough to leave room (`showPrice`), and always on the chosen one,
 * which also grows and gets a soft halo. A paid (featured) listing carries a small gold star.
 */
function PropertyMarkerView({
  property,
  selected,
  showPrice = false,
}: {
  property: Property;
  selected: boolean;
  showPrice?: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const seller = useSellerLabel()(property);
  const price = format.compactPrice(property.price, property.currency);
  const tone = dealColors[property.deal_type];
  return (
    <View
      style={styles.markerBox}
      accessibilityLabel={[
        t(`propertyType.${property.type}`),
        t(`dealType.${property.deal_type}`),
        price,
        seller,
      ].join('، ')}
      accessibilityState={{ selected }}
    >
      {showPrice || selected ? (
        <View
          style={[
            styles.tag,
            selected ? styles.tagSelected : null,
            shadow.card,
          ]}
        >
          <AppText
            variant="caption"
            color={selected ? colors.textOnPrimary : INK}
            numberOfLines={1}
            style={styles.tagText}
          >
            {price}
          </AppText>
        </View>
      ) : null}
      <View style={styles.badgeBox}>
        {selected ? (
          <View style={[styles.halo, { backgroundColor: tone.main }]} />
        ) : null}
        <View
          testID="marker-badge"
          style={[
            styles.badge,
            { backgroundColor: tone.main },
            selected ? styles.badgeSelected : null,
            shadow.floating,
          ]}
        >
          <Icon
            name={PROPERTY_LINE_ICONS[property.type]}
            size={20}
            color={WHITE}
            background={tone.main}
            weight={2.1}
          />
          {property.is_featured ? (
            <View testID="featured-star" style={styles.star} />
          ) : null}
        </View>
      </View>
      <Tail color={tone.main} />
    </View>
  );
}

/**
 * A verified real-estate office: a rounded square (never a circle, so it cannot be taken for a listing) in
 * deep emerald with the office icon and a gold tick. Its name shows when the map is close, or when chosen.
 */
function AgencyMarkerView({
  agency,
  selected,
  showPrice: showName = false,
}: {
  agency: AgencyMapPin;
  selected: boolean;
  /** Named `showPrice` like the listing marker so the map passes both the same prop. */
  showPrice?: boolean;
}) {
  return (
    <View
      style={styles.markerBox}
      accessibilityLabel={agency.agency_name}
      accessibilityState={{ selected }}
    >
      {showName || selected ? (
        <View
          style={[
            styles.tag,
            selected ? styles.tagSelected : null,
            shadow.card,
          ]}
        >
          <AppText
            variant="caption"
            color={selected ? colors.textOnPrimary : INK}
            numberOfLines={1}
            style={styles.tagText}
          >
            {agency.agency_name}
          </AppText>
        </View>
      ) : null}
      <View style={styles.badgeBox}>
        <View
          style={[
            styles.agencyBadge,
            selected ? styles.badgeSelected : null,
            shadow.floating,
          ]}
        >
          <Icon
            name="office"
            size={20}
            color={WHITE}
            background={colors.primaryDark}
            weight={2.1}
          />
          <View style={styles.tick}>
            <AppText style={styles.tickGlyph} color={colors.textOnAccent}>
              ✓
            </AppText>
          </View>
        </View>
      </View>
      <Tail color={colors.primaryDark} />
    </View>
  );
}

/**
 * Several things in one place: a dark pill with the count and what is counted ("۱۲ ملک"; "مورد" when offices
 * are among them). Taller for bigger piles, capped so it never swallows the map.
 */
export function ClusterMarker({
  count,
  onlyProperties = true,
}: {
  count: number;
  /** false when offices are in the group, so the word "properties" would be wrong. */
  onlyProperties?: boolean;
}) {
  const { t } = useTranslation();
  const height = Math.min(
    50,
    38 + Math.floor(Math.log10(Math.max(count, 1)) * 6),
  );
  const label = t(
    onlyProperties ? 'home.clusterBadge' : 'home.clusterBadgeMixed',
    { count: formatNumber(count, 0) },
  );
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={t('home.clusterTitle', {
        count: formatNumber(count, 0),
      })}
      style={[
        styles.cluster,
        { height, borderRadius: height / 2, minWidth: height },
        shadow.floating,
      ]}
    >
      <AppText variant="label" color={WHITE} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

// Markers are redrawn whenever the map settles, but most of them are unchanged each time.
export const PropertyMarker = React.memo(PropertyMarkerView);
export const AgencyMarker = React.memo(AgencyMarkerView);

/** "You are here". Blue is the universal colour for it, which is why it is not a brand colour. */
export function UserDot() {
  const { t } = useTranslation();
  return (
    <View style={styles.userHalo} accessibilityLabel={t('home.you')}>
      <View style={styles.userDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  markerBox: { alignItems: 'center' },
  // Room for the halo, so the chosen marker growing never moves the tip.
  badgeBox: {
    width: HALO,
    height: BADGE + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    opacity: 0.22,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 2.5,
    borderColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSelected: { transform: [{ scale: 1.15 }] },
  star: {
    position: 'absolute',
    top: -5,
    end: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentBright,
    borderWidth: 2,
    borderColor: WHITE,
  },
  // A square turned 45 degrees with only its right and bottom edges drawn: a "v" under the badge. Border widths and
  // positions are mirrored by React Native in a right-to-left layout while the rotation is not, so the tail is
  // laid out left-to-right to stay a "v".
  tail: {
    direction: 'ltr',
    width: 10,
    height: 10,
    marginTop: -7,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: WHITE,
    transform: [{ rotate: '45deg' }],
  },
  tag: {
    maxWidth: TAG_MAX_WIDTH,
    marginBottom: spacing.xs,
    backgroundColor: WHITE,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 1,
  },
  tagSelected: { backgroundColor: INK },
  tagText: { fontWeight: '600' },
  agencyBadge: {
    width: BADGE,
    height: BADGE,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: WHITE,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    top: -6,
    end: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accentBright,
    borderWidth: 2,
    borderColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickGlyph: { fontSize: 9, lineHeight: 12 },
  cluster: {
    backgroundColor: INK,
    borderWidth: 3,
    borderColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  userHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.2)', // colors.info at 20%
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.info,
    borderWidth: 3,
    borderColor: WHITE,
  },
});
