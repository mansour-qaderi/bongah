import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  AgencyMapPin,
  Property,
  PropertyType,
} from '@bongah/shared-types';
import AppText from '../components/AppText';
import Icon, { type IconName } from '../components/Icon';
import { formatNumber } from '../i18n/format';
import { currentPropertyType, propertyTypeLabel } from '../i18n/propertyType';
import { useFormat } from '../i18n/useFormat';
import { colors, dealColors, radius, spacing } from '../theme';

/** A glyph per kind of property for places that still draw text (list rows, the picture-less thumbnail). */
export const PROPERTY_ICONS: Record<PropertyType, string> = {
  APARTMENT: '🏢',
  HOUSE_HAWILI: '🏠',
  LAND: '🏞️',
  SHOP: '🏪',
  OFFICE: '🏬',
  GARDEN: '🌳',
  VILLA: '🏡',
  GARAGE: '🚗',
  OTHER: '📦',
};

/** The line icon for each kind of property: what the marker shows, so the type reads before the price does. */
export const PROPERTY_LINE_ICONS: Record<PropertyType, IconName> = {
  APARTMENT: 'apartment',
  HOUSE_HAWILI: 'house',
  LAND: 'land',
  SHOP: 'shop',
  OFFICE: 'office',
  GARDEN: 'garden',
  VILLA: 'villa',
  GARAGE: 'garage',
  OTHER: 'more',
};

/** The line icon of a listing's type; a type from an older server still gets a picture instead of a crash. */
export const propertyLineIcon = (type: string): IconName =>
  PROPERTY_LINE_ICONS[currentPropertyType(type)];

/** The same for the emoji a cluster list shows. */
export const propertyEmoji = (type: string): string =>
  PROPERTY_ICONS[currentPropertyType(type)];

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

/** A small downward point under a badge, so its tip marks the exact spot. Gold-edged on a featured listing. */
function Tail({ color, gold = false }: { color: string; gold?: boolean }) {
  return (
    <View
      style={[
        styles.tail,
        { backgroundColor: color },
        gold ? styles.tailGold : null,
      ]}
    />
  );
}

/** One pulse of the featured glow: how long it takes to grow and fade out. */
export const FEATURED_PULSE_MS = 1700;

/**
 * The glow behind a featured (paid, "آگهی ویژه") listing: a steady soft gold disc and a ring of gold that grows out of
 * the badge and fades, over and over. The ring stops (the disc stays) for someone who has asked their phone for
 * less motion. It never grows past the room the selected marker's halo already has, so the marker's frame is not
 * outgrown.
 */
function FeaturedGlow() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled())
      .catch(() => false)
      .then(reduce => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.timing(pulse, {
            toValue: 1,
            duration: FEATURED_PULSE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, HALO / BADGE],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });
  return (
    <>
      <View testID="featured-glow" style={styles.glow} />
      <Animated.View
        testID="featured-pulse"
        pointerEvents="none"
        style={[styles.pulse, { opacity, transform: [{ scale }] }]}
      />
    </>
  );
}

/**
 * A listing. The badge is a coloured disc: the colour says what it is offered for (emerald = sale, blue =
 * rent, gold = growi) and the white line icon says what it is (flat, house, plot, shop, villa). The price
 * appears above it once the map is close enough to leave room (`showPrice`), and always on the chosen one,
 * which also grows and gets a soft halo. A paid (featured) listing is the one that stands out: a gold ring round
 * its badge, a gold glow that pulses, a gold tail and a small gold star, so it is found first on a crowded map.
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
  const featured = property.is_featured;
  return (
    <View
      style={styles.markerBox}
      accessibilityLabel={[
        featured ? t('property.featured') : null,
        propertyTypeLabel(property.type, t),
        t(`dealType.${property.deal_type}`),
        price,
        seller,
      ]
        .filter(Boolean)
        .join('، ')}
      accessibilityState={{ selected }}
    >
      {showPrice || selected ? (
        <View style={[styles.tag, selected ? styles.tagSelected : null]}>
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
        {featured ? <FeaturedGlow /> : null}
        {selected ? (
          <View style={[styles.halo, { backgroundColor: tone.main }]} />
        ) : null}
        <View
          testID="marker-badge"
          style={[
            styles.badge,
            { backgroundColor: tone.main },
            featured ? styles.badgeFeatured : null,
            selected ? styles.badgeSelected : null,
          ]}
        >
          <Icon
            name={propertyLineIcon(property.type)}
            size={20}
            color={WHITE}
            background={tone.main}
            weight={2.1}
          />
          {featured ? (
            <View testID="featured-star" style={styles.star} />
          ) : null}
        </View>
      </View>
      <Tail color={tone.main} gold={featured} />
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
        <View style={[styles.tag, selected ? styles.tagSelected : null]}>
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
          style={[styles.agencyBadge, selected ? styles.badgeSelected : null]}
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
  hasFeatured = false,
}: {
  count: number;
  /** false when offices are in the group, so the word "properties" would be wrong. */
  onlyProperties?: boolean;
  /** true when a featured listing is among them: the pile gets a gold edge, so it is not passed over. */
  hasFeatured?: boolean;
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
        hasFeatured ? styles.clusterFeatured : null,
        { height, borderRadius: height / 2, minWidth: height },
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
  // A featured listing: a gold ring in place of the white one, a little larger than the rest.
  badgeFeatured: {
    borderColor: colors.accentBright,
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  glow: {
    position: 'absolute',
    width: BADGE + 12,
    height: BADGE + 12,
    borderRadius: (BADGE + 12) / 2,
    backgroundColor: colors.accentBright,
    opacity: 0.35,
  },
  pulse: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 3,
    borderColor: colors.accentBright,
    backgroundColor: 'rgba(245,158,11,0.25)', // colors.accentBright at 25%
  },
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
  tailGold: { borderColor: colors.accentBright },
  tag: {
    maxWidth: TAG_MAX_WIDTH,
    marginBottom: spacing.xs,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 1,
  },
  tagSelected: { backgroundColor: INK, borderColor: INK },
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
  clusterFeatured: { borderColor: colors.accentBright, borderWidth: 3.5 },
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
