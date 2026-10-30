import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { colors, spacing } from '../theme';
import Badge, { badgeTones } from './Badge';
import Price from './Price';
import AppText from './AppText';
import { formatCurrency } from '../i18n/format';
import { priceTermsLabel } from '../i18n/market';
import { rentPerMonthText } from '../i18n/rentPrice';

/**
 * The monthly rent of a «رهن و اجاره» listing (Iran: a deposit and a rent every month), written beside its price: the
 * price is the deposit, this is the rent. Nothing is drawn for any other deal.
 */
export function MonthlyRent({
  property,
  variant = 'caption',
}: {
  property: Pick<Property, 'currency'> &
    Partial<Pick<Property, 'deal_type' | 'monthly_rent'>>;
  variant?: React.ComponentProps<typeof AppText>['variant'];
}) {
  const { t } = useTranslation();
  const text = rentPerMonthText(
    property,
    amount => formatCurrency(amount, property.currency),
    t,
  );
  return text ? (
    <AppText variant={variant} color={colors.textSecondary} testID="monthly-rent">
      {text}
    </AppText>
  ) : null;
}

/**
 * A listing's price on a card, and beside it, when the owner said so, the terms of that price as a small badge:
 * «جورآمد (قابل توافق)» in Afghanistan and «قابل توافق» in Iran (negotiable) or «مقطوع» (fixed). Nothing is drawn for a listing that says neither.
 */
export default function PriceLine({
  property,
  style,
  priceStyle,
  variant = 'title',
  color = colors.primary,
}: {
  property: Pick<Property, 'price' | 'currency' | 'price_terms'> &
    Partial<Pick<Property, 'deal_type' | 'monthly_rent' | 'market'>>;
  style?: StyleProp<ViewStyle>;
  priceStyle?: StyleProp<TextStyle>;
  /** The price's type size (the card's own: «title» on the lists, «heading» on the map card). */
  variant?: React.ComponentProps<typeof Price>['variant'];
  color?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, style]}>
      <Price
        amount={property.price}
        currency={property.currency}
        variant={variant}
        color={color}
        style={priceStyle}
      />
      <MonthlyRent property={property} variant="bodySm" />
      {property.price_terms ? (
        <Badge
          label={priceTermsLabel(property.price_terms, property.market, t)}
          tone={badgeTones.neutral}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // The terms sit on the figure's own baseline, so a tall line-height on the price cannot lift or sink the badge.
    alignItems: 'baseline',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
});
