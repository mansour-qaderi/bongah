import type { Currency, DealType } from '@bongah/shared-types';

/**
 * Where the price slider's thumbs stop. Prices are nowhere near linear (a rent is thousands, a house millions),
 * so each kind of deal has its own ladder, and with no deal chosen a coarse one that spans them all. The first
 * stop means "no minimum" and the last "no maximum", so the two ends are always open. Exact amounts are typed in
 * the boxes under the slider; the slider is for a quick pick.
 */
const STOPS: Record<Currency, Record<DealType | 'ANY', readonly number[]>> = {
  AFGHANI: {
    SALE: [
      0, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000,
      10_000_000, 15_000_000, 25_000_000, 50_000_000, 100_000_000,
    ],
    RENT: [
      0, 3_000, 5_000, 8_000, 10_000, 15_000, 20_000, 30_000, 50_000, 75_000,
      100_000, 200_000,
    ],
    MORTGAGE_GROWI: [
      0, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000,
      7_500_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000,
    ],
    ANY: [
      0, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
      1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
      100_000_000,
    ],
  },
  USD: {
    SALE: [
      0, 5_000, 10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 150_000,
      250_000, 500_000, 1_000_000,
    ],
    RENT: [0, 50, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 5_000],
    MORTGAGE_GROWI: [
      0, 2_000, 5_000, 10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 200_000,
      500_000, 1_000_000,
    ],
    ANY: [
      0, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
      250_000, 500_000, 1_000_000,
    ],
  },
};

export function priceStops(
  deal: DealType | undefined,
  currency: Currency,
): readonly number[] {
  return STOPS[currency][deal ?? 'ANY'];
}
