import { FEATURED_BUNDLE_DISCOUNT_PERCENT, FEATURED_BUNDLE_SIZES, type FeaturedBundle } from '@bongah/shared-types';
import { actualDiscountPercent } from './subscription-prices.js';

export type FeaturedBundleSize = (typeof FEATURED_BUNDLE_SIZES)[number];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What `size` featured listings cost bought one by one. */
export const bundleListPrice = (single: number, size: number): number => round2(single * size);

/** What a bundle costs: the one-by-one price less the bundle's discount (5 for 10% off, 10 for 20% off). */
export const bundlePrice = (single: number, size: FeaturedBundleSize): number =>
  round2(bundleListPrice(single, size) * (1 - FEATURED_BUNDLE_DISCOUNT_PERCENT[size] / 100));

/** The bundles the app offers, priced from the current single featured price (so an admin changing it moves them). */
export function featuredBundles(single: number): FeaturedBundle[] {
  return FEATURED_BUNDLE_SIZES.map((size) => {
    const price = bundlePrice(single, size);
    const list = bundleListPrice(single, size);
    return { size, price, list_price: list, discount_percent: actualDiscountPercent(price, list) };
  });
}
