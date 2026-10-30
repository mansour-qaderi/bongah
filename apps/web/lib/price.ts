import type { DealType, Property } from '@bongah/shared-types';
import { tNow } from '@/i18n/active';
import { formatMoney } from './format';

/** The deposit and the monthly rent of a mortgage-and-rent (رهن و اجاره) listing; for any other deal, null. */
export const isMortgageRent = (deal: DealType | '' | undefined): boolean => deal === 'MORTGAGE_RENT';

/**
 * A listing's price as one line. A sale, rent or full mortgage is its price; a mortgage-and-rent is two amounts, the
 * deposit (`price`) and the rent every month: «رهن ۲۰۰٬۰۰۰٬۰۰۰ · اجاره ۸٬۰۰۰٬۰۰۰ در ماه».
 */
export function listingPrice(p: Pick<Property, 'price' | 'monthly_rent' | 'currency' | 'deal_type'>): string {
  if (p.deal_type === 'MORTGAGE_RENT' && p.monthly_rent != null) {
    return tNow('price.mortgageRent', { deposit: formatMoney(p.price, p.currency), rent: formatMoney(p.monthly_rent, p.currency) });
  }
  return formatMoney(p.price, p.currency);
}
