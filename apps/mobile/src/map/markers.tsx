import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type {
  AgencyMapPin,
  Property,
  PropertyType,
} from '@bongah/shared-types';
import AppText from '../components/AppText';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { colors, radius, shadow, spacing } from '../theme';

/** One glyph per kind of property, so the type reads at a glance on the map. */
export const PROPERTY_ICONS: Record<PropertyType, string> = {
  APARTMENT: '🏢',
  HOUSE_HAWILI: '🏠',
  LAND: '🏞️',
  OFFICE_SHOP: '🏬',
  GARDEN_VILLA: '🏡',
};

/** Who is selling, for a marker: the agency's name, or "owner" for a private seller. */
export function useSellerLabel() {
  const { t } = useTranslation();
  return (property: Pick<Property, 'agency_name'>) =>
    property.agency_name ?? t('property.owner');
}

/** A small downward pointer under a pill, so the tip marks the exact spot. */
function Tail({ color }: { color: string }) {
  return <View style={[styles.tail, { backgroundColor: color }]} />;
}

/**
 * A listing: type icon, price and seller. White with an emerald edge; the chosen one turns gold, and a
 * featured (paid) listing carries a gold star.
 */
export function PropertyMarker({
  property,
  selected,
}: {
  property: Property;
  selected: boolean;
}) {
  const format = useFormat();
  const seller = useSellerLabel()(property);
  const price = format.compactPrice(property.price, property.currency);
  return (
    <View
      style={styles.markerBox}
      accessibilityLabel={`${price} ${seller}`}
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.pill,
          selected ? styles.pillSelected : null,
          shadow.card,
        ]}
      >
        <View
          style={[
            styles.icon,
            selected ? styles.iconSelected : styles.iconIdle,
          ]}
        >
          <AppText style={styles.iconGlyph}>
            {PROPERTY_ICONS[property.type]}
          </AppText>
        </View>
        <View style={styles.pillText}>
          <AppText variant="label" color={colors.primaryDark} numberOfLines={1}>
            {property.is_featured ? '★ ' : ''}
            {price}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {seller}
          </AppText>
        </View>
      </View>
      <Tail color={selected ? colors.accentBright : colors.primary} />
    </View>
  );
}

/**
 * A verified real-estate office: a solid emerald pill (so it never looks like a listing) with the office
 * glyph, its name and a tick. There is no logo or rating field yet; when there is, the glyph slot is where
 * the logo goes.
 */
export function AgencyMarker({
  agency,
  selected,
}: {
  agency: AgencyMapPin;
  selected: boolean;
}) {
  return (
    <View
      style={styles.markerBox}
      accessibilityLabel={agency.agency_name}
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.agencyPill,
          selected ? styles.agencyPillSelected : null,
          shadow.card,
        ]}
      >
        <View style={styles.agencyIcon}>
          <AppText style={styles.iconGlyph}>🏛️</AppText>
        </View>
        <AppText
          variant="label"
          color={colors.textOnPrimary}
          numberOfLines={1}
          style={styles.agencyName}
        >
          {agency.agency_name}
        </AppText>
        <AppText variant="caption" color={colors.accentBright}>
          ✓
        </AppText>
      </View>
      <Tail color={selected ? colors.accentBright : colors.primaryDark} />
    </View>
  );
}

/** Several things in one place. Bigger for bigger piles, capped so it never swallows the map. */
export function ClusterMarker({ count }: { count: number }) {
  const { t } = useTranslation();
  const size = Math.min(
    56,
    38 + Math.floor(Math.log10(Math.max(count, 1)) * 10),
  );
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={t('home.clusterTitle', {
        count: formatNumber(count, 0),
      })}
      style={[
        styles.cluster,
        { width: size, height: size, borderRadius: size / 2 },
        shadow.card,
      ]}
    >
      <AppText variant="label" color={colors.textOnPrimary}>
        {formatNumber(count, 0)}
      </AppText>
    </View>
  );
}

/** "You are here". Blue is the universal colour for it, which is why it is not a brand colour. */
export function UserDot() {
  const { t } = useTranslation();
  return (
    <View style={styles.userHalo} accessibilityLabel={t('home.you')}>
      <View style={styles.userDot} />
    </View>
  );
}

const PILL_MAX_WIDTH = 168;

const styles = StyleSheet.create({
  markerBox: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: PILL_MAX_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: spacing.md,
  },
  pillSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBright,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconIdle: { backgroundColor: colors.primarySoft },
  iconSelected: { backgroundColor: colors.accentBright },
  iconGlyph: { fontSize: 16, lineHeight: 22 },
  pillText: { flexShrink: 1 },
  tail: {
    width: 10,
    height: 10,
    marginTop: -6,
    transform: [{ rotate: '45deg' }],
  },
  agencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: PILL_MAX_WIDTH,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.surface,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: spacing.md,
  },
  agencyPillSelected: { borderColor: colors.accentBright },
  agencyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agencyName: { flexShrink: 1 },
  cluster: {
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: colors.surface,
  },
});
