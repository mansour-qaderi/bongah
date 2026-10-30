import { BadRequestException } from '@nestjs/common';
import {
  marketMismatch,
  type Currency,
  type DealType,
  type DeedType,
  type Market,
  type PropertyFeature,
  type PropertyType,
} from '@bongah/shared-types';

/** The wire field each kind of mismatch is reported on, so a form can mark the right box. */
const FIELD = {
  CURRENCY_NOT_IN_MARKET: 'currency',
  DEAL_NOT_IN_MARKET: 'deal_type',
  TYPE_NOT_IN_MARKET: 'type',
  DAILY_RENT_TYPE: 'deal_type',
  FEATURE_NOT_IN_MARKET: 'features',
  DEED_NOT_IN_MARKET: 'deed_type',
  PIN_OUTSIDE_MARKET: 'lat',
} as const;

const MESSAGE = {
  CURRENCY_NOT_IN_MARKET: 'This currency is not offered in the listing\'s market.',
  DEAL_NOT_IN_MARKET: 'This kind of deal is not offered in the listing\'s market.',
  TYPE_NOT_IN_MARKET: 'This kind of property is not offered in the listing\'s market.',
  DAILY_RENT_TYPE: 'A daily rental is only for a villa or a garden.',
  FEATURE_NOT_IN_MARKET: 'This tag is not offered in the listing\'s market.',
  DEED_NOT_IN_MARKET: 'This kind of deed is not offered in the listing\'s market.',
  PIN_OUTSIDE_MARKET: 'The map location is outside the listing\'s market.',
} as const;

/**
 * Refuses a listing that does not fit its market (a toman price on an Afghan listing, a Kabul pin on an Iranian one).
 * `fields` holds only what the request or the stored listing says; a missing field is not checked.
 */
export function assertFitsMarket(
  market: Market,
  fields: {
    currency?: Currency;
    deal_type?: DealType;
    type?: PropertyType;
    features?: readonly PropertyFeature[] | null;
    deed_type?: DeedType | null;
    lat?: number | null;
    lng?: number | null;
  },
): void {
  const mismatch = marketMismatch(market, fields);
  if (mismatch === null) return;
  throw new BadRequestException({
    message: MESSAGE[mismatch],
    code: 'MARKET_MISMATCH',
    market,
    errors: [{ field: FIELD[mismatch], message: MESSAGE[mismatch] }],
  });
}
