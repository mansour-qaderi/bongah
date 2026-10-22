import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { hasRoomsFor } from '../constants/propertyRooms';
import { formatNumber } from '../i18n/format';
import { propertyTypeLabel } from '../i18n/propertyType';
import { useFormat } from '../i18n/useFormat';
import { propertyLineIcon } from '../map/markers';
import { startsWithProvince } from '../utils/addressLine';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Icon, { type IconName } from './Icon';

/**
 * Where a listing is, in one line: the province, then the most specific place it has. Older listings carry a
 * district; a new one is written as one free address, so a blank district falls back to the neighbourhood and then to
 * the address itself. An address that already starts with the province (a whole line: "نیمروز، زرنج، ناحیه ۴، …") is
 * not given the province a second time.
 */
export function propertyPlace(
  property: Pick<
    Property,
    'province' | 'district' | 'neighborhood' | 'address'
  >,
  provinceName: (value: string) => string,
): string {
  const where = (
    property.district ||
    property.neighborhood ||
    property.address ||
    ''
  ).trim();
  const province = provinceName(property.province);
  if (!where) return province;
  return startsWithProvince(where, province) ? where : [province, where].filter(Boolean).join('، ');
}

interface Fact {
  key: string;
  icon: IconName;
  text: string;
}

/** A fact as a short run: the icon and its words, side by side. */
function RowFact({ icon, text }: Omit<Fact, 'key'>) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={16} color={colors.textMuted} weight={1.8} />
      <AppText variant="caption" color={colors.textSecondary}>
        {text}
      </AppText>
    </View>
  );
}

/** A fact as a grid cell: its icon in a small soft tile, and the words beside it. */
function GridFact({ icon, text }: Omit<Fact, 'key'>) {
  return (
    <View style={styles.cell}>
      <View style={styles.tile}>
        <Icon name={icon} size={16} color={colors.textSecondary} weight={1.8} />
      </View>
      <View style={styles.cellBody}>
        <AppText
          variant="label"
          color={colors.text}
          numberOfLines={2}
          style={styles.cellText}
        >
          {text}
        </AppText>
      </View>
    </View>
  );
}

interface Props {
  property: Property;
  /** Lead with the kind of property (house, flat…) and its own icon. The list card does; the badges card does not. */
  withType?: boolean;
  /**
   * Also say which unit it is ("واحد ۳"), as a fact of its own after the kind. Only the details page does: on the cards
   * the kind chip says the kind and nothing else, so what an owner typed in the unit box (sometimes the listing's own
   * title) is never repeated under the title.
   */
  withUnit?: boolean;
  /**
   * 'row' (the default): one wrapping line of small icons and words, for the dense cards.
   * 'grid': two columns by up to two rows, each fact with its own icon tile — the kind and the area above, the
   * bedrooms and the bathrooms below. The list card uses it.
   */
  layout?: 'row' | 'grid';
  /** Grid layout: draw the hairline above it (default), or leave it off when the grid starts a card of its own. */
  divider?: boolean;
  /**
   * Also say how the price is meant («مقطوع» fixed, «جورآمد» negotiable), as the last cell of the grid, when the owner
   * said so. The cards use it: the price stays alone on its line and its terms sit with the other figures.
   */
  withPriceTerms?: boolean;
}

/**
 * The few figures that decide whether a listing is worth opening: the kind, the area, the bedrooms and the bathrooms,
 * each with its own line icon (a ruler, a bed, a shower). A figure the listing does not have (land has no rooms) is
 * simply left out.
 */
export default function PropertyFacts({
  property,
  withType,
  withUnit,
  layout = 'row',
  divider = true,
  withPriceTerms = false,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();

  const facts: Fact[] = [];
  if (withType) {
    facts.push({
      key: 'type',
      icon: propertyLineIcon(property.type),
      text: propertyTypeLabel(property.type, t),
    });
    if (withUnit && property.unit) {
      facts.push({ key: 'unit', icon: 'apartment', text: property.unit });
    }
  }
  facts.push({
    key: 'area',
    icon: 'area',
    text: format.area(property.area_sqm),
  });
  // A shop, an office, land or a garage has no rooms to count, whatever an older listing has stored.
  const rooms = hasRoomsFor(property.type);
  if (rooms && property.bedrooms !== null) {
    facts.push({
      key: 'bedrooms',
      icon: 'bed',
      text: `${formatNumber(property.bedrooms, 0)} ${t('property.bedrooms')}`,
    });
  }
  if (rooms && property.bathrooms !== null) {
    facts.push({
      key: 'bathrooms',
      icon: 'shower',
      text: `${formatNumber(property.bathrooms, 0)} ${t('property.bathrooms')}`,
    });
  }

  if (withPriceTerms && property.price_terms) {
    facts.push({
      key: 'priceTerms',
      icon: 'coin',
      text: t(`priceTerms.${property.price_terms}`),
    });
  }

  if (layout === 'grid') {
    return (
      <View
        style={[styles.grid, divider ? styles.gridDivider : null]}
        testID="property-facts"
      >
        {facts.map(({ key, icon, text }) => (
          <GridFact key={key} icon={icon} text={text} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.row} testID="property-facts">
      {facts.map(({ key, icon, text }) => (
        <RowFact key={key} icon={icon} text={text} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.md,
  },
  gridDivider: {
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // Two to a row, whatever the width: each takes just under half, the gap between them makes up the rest.
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexBasis: '45%',
    flexGrow: 1,
    flexShrink: 1,
  },
  cellBody: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
  },
  cellText: { flexShrink: 1 },
  tile: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
});
