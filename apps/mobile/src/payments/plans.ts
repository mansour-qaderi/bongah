import {
  BEST_SUBSCRIPTION_PACKAGE,
  SUBSCRIPTION_DISCOUNT_PERCENT,
  SUBSCRIPTION_MONTHS,
  SUBSCRIPTION_PACKAGES,
  type PlanBenefits,
  type Pricing,
  type SubscriptionPackage,
} from '@bongah/shared-types';

/** One subscription plan as the upgrade screen shows it. */
export interface PlanOffer {
  pkg: SubscriptionPackage;
  months: number;
  /** What it costs. */
  price: number;
  /** What the same months would cost at the monthly list price, before any discount. */
  listPrice: number;
  /** The discount the price really gives, in whole percent (the advertised one when the server sent no list prices). */
  discountPercent: number;
  /** What one month of this plan comes to. */
  perMonth: number;
  /** Money saved against the list price. */
  saving: number;
  best: boolean;
  /**
   * What the plan includes (listings, gift listings, featured gifts, accounting, portfolio), as the server sends it.
   * Undefined from an older server: the card then lists nothing it cannot vouch for.
   */
  benefits?: PlanBenefits;
}

/**
 * The plans in the order they are shown (monthly first, yearly last), each with the discount worked out from the
 * prices the server really charges. The percentage is therefore never a promise the price does not keep: if an
 * admin changes a price, the screen shows the new discount. Without list prices (an older server) the advertised
 * percentage is used and the list price is derived from it.
 *
 * A plan the server sends no price for is left out: the app never shows (or tries to sell) a price the server did
 * not set. That is what an API that predates the six-month plan looks like.
 */
export function planOffers(pricing: Pricing): PlanOffer[] {
  return SUBSCRIPTION_PACKAGES.filter(pkg => {
    const price = pricing.subscription[pkg];
    return typeof price === 'number' && price > 0;
  }).map(pkg => {
    const months = SUBSCRIPTION_MONTHS[pkg];
    const price = pricing.subscription[pkg];
    const advertised = SUBSCRIPTION_DISCOUNT_PERCENT[pkg];
    const listed = pricing.subscription_list?.[pkg];
    const listPrice =
      listed && listed > 0 ? listed : price / (1 - advertised / 100);
    const discountPercent =
      listed && listed > 0
        ? Math.max(0, Math.round((1 - price / listed) * 100))
        : advertised;
    return {
      pkg,
      months,
      price,
      listPrice,
      discountPercent,
      perMonth: price / months,
      saving: Math.max(0, listPrice - price),
      best: pkg === BEST_SUBSCRIPTION_PACKAGE,
      benefits: pricing.plans?.[pkg],
    };
  });
}
