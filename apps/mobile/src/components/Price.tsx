import React from 'react';
import type { TextProps } from 'react-native';
import type { Currency } from '@bongah/shared-types';
import { CURRENCY_SYMBOLS, formatAmount, formatCurrency } from '../i18n/format';
import { fonts, typography, type TextVariant } from '../theme';
import AppText from './AppText';

interface Props extends Omit<TextProps, 'children'> {
  amount: number;
  currency: Currency;
  /** The size of the figure; the sign is drawn at `SIGN_SCALE` of it. */
  variant?: TextVariant;
  color?: string;
}

/**
 * The sign is drawn at this fraction of the figure, in the regular weight. At full size the Afghani sign (؋) is as tall as the digits
 * and twice as heavy, so it shouts over the number it belongs to; at 60% it shrank to a speck that could not be read
 * as a currency at all. About four fifths keeps it plainly legible and still quieter than the figure.
 */
export const SIGN_SCALE = 0.8;

/**
 * A price: the figure at the size of `variant` and the currency sign small and quiet beside it. The figure is grouped
 * with plain commas (see `formatAmount`). Screen readers get the whole price as one phrase.
 */
export default function Price({
  amount,
  currency,
  variant = 'title',
  color,
  style,
  ...rest
}: Props) {
  const size = typography[variant].fontSize;
  return (
    <AppText
      accessibilityLabel={formatCurrency(amount, currency)}
      variant={variant}
      color={color}
      style={style}
      {...rest}
    >
      {formatAmount(amount)}
      <AppText
        variant={variant}
        color={color}
        style={{
          fontSize: Math.round(size * SIGN_SCALE),
          fontFamily: fonts.regular,
        }}
      >
        {` ${CURRENCY_SYMBOLS[currency]}`}
      </AppText>
    </AppText>
  );
}
