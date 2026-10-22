import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { colors, spacing } from '../theme';
import Badge, { badgeTones } from './Badge';
import Price from './Price';

/**
 * A listing's price on a card, and beside it, when the owner said so, the terms of that price as a small badge:
 * «جورآمد (قابل توافق)» (negotiable) or «مقطوع» (fixed). Nothing is drawn for a listing that says neither.
 */
export default function PriceLine({
  property,
  style,
  priceStyle,
}: {
  property: Pick<Property, 'price' | 'currency' | 'price_terms'>;
  style?: StyleProp<ViewStyle>;
  priceStyle?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, style]}>
      <Price
        amount={property.price}
        currency={property.currency}
        variant="title"
        color={colors.primary}
        style={priceStyle}
      />
      {property.price_terms ? (
        <Badge
          label={t(`priceTerms.${property.price_terms}`)}
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
