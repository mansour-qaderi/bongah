import type { TFunction } from 'i18next';
import type { Currency, DealType } from '@bongah/shared-types';

/** The fields of a listing that decide whether it has a monthly rent beside its price. */
export interface RentFields {
  deal_type?: DealType | null;
  monthly_rent?: number | null;
}

/**
 * The monthly rent of a «رهن و اجاره» listing (Iran: a deposit AND a rent every month), or null for any other deal
 * and for an older row of that deal with no rent stored. For that deal `price` is the deposit.
 */
export const monthlyRentOf = (listing: RentFields): number | null =>
  listing.deal_type === 'MORTGAGE_RENT' && typeof listing.monthly_rent === 'number'
    ? listing.monthly_rent
    : null;

/** «اجاره ۸٬۰۰۰٬۰۰۰ تومان در ماه», the second line under a deposit; null when the listing has no monthly rent. */
export function rentPerMonthText(
  listing: RentFields,
  money: (amount: number) => string,
  t: TFunction,
): string | null {
  const rent = monthlyRentOf(listing);
  return rent === null ? null : t('price.rentPerMonth', { amount: money(rent) });
}

/**
 * The whole price of a listing as one line of plain text (a chat header, a share message, a dashboard row, a marker's
 * spoken label): the amount for any deal, and «رهن … · اجاره … در ماه» for a mortgage-and-rent.
 */
export function listingPriceText(
  listing: RentFields & { price: number; currency: Currency },
  money: (amount: number, currency: Currency) => string,
  t: TFunction,
): string {
  const rent = monthlyRentOf(listing);
  const deposit = money(listing.price, listing.currency);
  return rent === null
    ? deposit
    : t('price.depositAndRent', {
        deposit,
        rent: money(rent, listing.currency),
        interpolation: { escapeValue: false },
      });
}
