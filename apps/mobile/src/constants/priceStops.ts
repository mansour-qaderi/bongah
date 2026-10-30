import type { Currency, DealType } from '@bongah/shared-types';

/**
 * Where the price slider's thumbs stop. Prices are nowhere near linear (a rent is thousands, a house millions),
 * so each kind of deal has its own ladder, and with no deal chosen a coarse one that spans them all. The first
 * stop means "no minimum" and the last "no maximum", so the two ends are always open. Exact amounts are typed in
 * the boxes under the slider; the slider is for a quick pick.
 */
type Ladders = Record<DealType | 'ANY', readonly number[]>;
/** The ladders written out by hand: رهن و اجاره is filtered by its deposit, so it climbs like the full mortgage. */
type Written = Record<Exclude<DealType, 'MORTGAGE_RENT'> | 'ANY', readonly number[]>;
const withRent = (ladders: Written): Ladders => ({
  ...ladders,
  MORTGAGE_RENT: ladders.MORTGAGE_GROWI,
});

/**
 * Iran: prices are said in toman (a flat is billions, a month's rent millions). Rials are the same ladders times ten
 * (1 toman = 10 rials), so a person filtering in rials moves through the same amounts.
 */
const TOMAN: Written = {
  SALE: [
    0, 500_000_000, 1_000_000_000, 2_000_000_000, 3_000_000_000, 5_000_000_000,
    7_500_000_000, 10_000_000_000, 15_000_000_000, 25_000_000_000,
    50_000_000_000, 100_000_000_000,
  ],
  RENT: [
    0, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 10_000_000,
    15_000_000, 20_000_000, 30_000_000, 50_000_000, 100_000_000,
  ],
  // رهن کامل: the deposit that is paid back, so it is far more than a month's rent and less than the price.
  MORTGAGE_GROWI: [
    0, 100_000_000, 200_000_000, 300_000_000, 500_000_000, 750_000_000,
    1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000, 5_000_000_000,
    10_000_000_000,
  ],
  // اجاره روزانه: per night.
  DAILY_RENT: [
    0, 500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000,
    7_500_000, 10_000_000, 15_000_000, 25_000_000, 50_000_000,
  ],
  ANY: [
    0, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000,
    500_000_000, 1_000_000_000, 5_000_000_000, 10_000_000_000, 50_000_000_000,
    100_000_000_000,
  ],
};
const times10 = (ladders: Written): Written => ({
  SALE: ladders.SALE.map(n => n * 10),
  RENT: ladders.RENT.map(n => n * 10),
  MORTGAGE_GROWI: ladders.MORTGAGE_GROWI.map(n => n * 10),
  DAILY_RENT: ladders.DAILY_RENT.map(n => n * 10),
  ANY: ladders.ANY.map(n => n * 10),
});

const STOPS: Record<Currency, Ladders> = {
  TOMAN: withRent(TOMAN),
  RIAL: withRent(times10(TOMAN)),
  AFGHANI: withRent({
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
    // Not offered in Afghanistan; a ladder anyway, so the table is complete.
    DAILY_RENT: [
      0, 500, 1_000, 2_000, 3_000, 5_000, 7_500, 10_000, 15_000, 25_000,
      50_000, 100_000,
    ],
    ANY: [
      0, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
      1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
      100_000_000,
    ],
  }),
  USD: withRent({
    SALE: [
      0, 5_000, 10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 150_000,
      250_000, 500_000, 1_000_000,
    ],
    RENT: [0, 50, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 5_000],
    MORTGAGE_GROWI: [
      0, 2_000, 5_000, 10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 200_000,
      500_000, 1_000_000,
    ],
    DAILY_RENT: [0, 20, 50, 100, 150, 200, 300, 500, 750, 1_000, 2_000, 5_000],
    ANY: [
      0, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
      250_000, 500_000, 1_000_000,
    ],
  }),
};

export function priceStops(
  deal: DealType | undefined,
  currency: Currency,
): readonly number[] {
  return STOPS[currency][deal ?? 'ANY'];
}
