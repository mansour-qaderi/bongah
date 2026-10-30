import {
  DAILY_RENT_TYPES,
  MARKET_CONFIG,
  defaultCurrency,
  type Currency,
  type DealType,
  type Market,
  type PropertyType,
} from '@bongah/shared-types';

/**
 * The kinds of property a deal may be for in a market, in the order the picker shows them. A daily rental is a
 * villa or a garden only, so choosing it narrows the list.
 */
export function typesForDeal(
  market: Market,
  deal: DealType,
): readonly PropertyType[] {
  const all = MARKET_CONFIG[market].propertyTypes;
  return deal === 'DAILY_RENT'
    ? all.filter(type =>
        (DAILY_RENT_TYPES as readonly PropertyType[]).includes(type),
      )
    : all;
}

export interface FormChoices {
  deal: DealType;
  type: PropertyType;
  currency: Currency;
}

/**
 * What a listing form's choices become when the market (or the deal) changes: whatever the market does not offer is
 * replaced by the market's first choice, and what it does offer is left alone, so changing country never throws away
 * a choice that still makes sense (dollars, an apartment, a sale).
 */
export function reconcileChoices(
  market: Market,
  choices: FormChoices,
): FormChoices {
  const config = MARKET_CONFIG[market];
  const deal = config.dealTypes.includes(choices.deal)
    ? choices.deal
    : config.dealTypes[0];
  const types = typesForDeal(market, deal);
  const type = types.includes(choices.type) ? choices.type : types[0];
  const currency = config.currencies.includes(choices.currency)
    ? choices.currency
    : defaultCurrency(market);
  return { deal, type, currency };
}
