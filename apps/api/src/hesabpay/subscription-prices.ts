import { SUBSCRIPTION_DISCOUNT_PERCENT, SUBSCRIPTION_MONTHS } from '@bongah/shared-types';
import type { SubscriptionPackage } from '../generated/prisma/client.js';

/**
 * How the plans are priced against each other. One number anchors them all: the monthly LIST price (what one month
 * costs without any discount). A plan's list price is that times its months; the price it is sold at is the list
 * price less the plan's discount (10% monthly, 20% for 3 months, 35% for 6, 50% for a year). So the discounts are
 * true by construction instead of being a label stuck on unrelated numbers.
 *
 * The list monthly price is one setting (HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY, 1000 by default) and an admin can
 * still override each plan's price; these functions give the defaults and the list prices the app shows next to them.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A price as the settings write it: a decimal string with at most two decimals ("4333.33", "900"). */
export const asPriceText = (n: number): string => String(round2(n));

/** What a plan costs without its discount. */
export function listPriceOf(listMonthly: number, pkg: SubscriptionPackage): number {
  return round2(listMonthly * SUBSCRIPTION_MONTHS[pkg]);
}

/** What a plan is sold at by default: its list price less its discount. */
export function defaultPriceOf(listMonthly: number, pkg: SubscriptionPackage): number {
  return round2(listPriceOf(listMonthly, pkg) * (1 - SUBSCRIPTION_DISCOUNT_PERCENT[pkg] / 100));
}

/** The discount a price really gives against a list price, in whole percent (what the app shows). */
export function actualDiscountPercent(price: number, list: number): number {
  return list > 0 ? Math.round((1 - price / list) * 100) : 0;
}
