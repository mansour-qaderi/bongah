import {
  actualDiscountPercent,
  asPriceText,
  defaultPriceOf,
  listPriceOf,
} from './subscription-prices.js';

describe('subscription prices', () => {
  it('multiplies the list price by the months', () => {
    expect(listPriceOf(1000, 'MONTHLY')).toBe(1000);
    expect(listPriceOf(1000, 'QUARTERLY')).toBe(3000);
    expect(listPriceOf(1000, 'SEMIANNUAL')).toBe(6000);
    expect(listPriceOf(1000, 'YEARLY')).toBe(12000);
  });

  it('sells each plan at its advertised discount: 10, 20, 35 and 50 percent', () => {
    expect(defaultPriceOf(1000, 'MONTHLY')).toBe(900);
    expect(defaultPriceOf(1000, 'QUARTERLY')).toBe(2400);
    expect(defaultPriceOf(1000, 'SEMIANNUAL')).toBe(3900);
    expect(defaultPriceOf(1000, 'YEARLY')).toBe(6000);
  });

  it('reports the discount a price really gives, rounded to whole percent', () => {
    expect(actualDiscountPercent(3900, 6000)).toBe(35);
    expect(actualDiscountPercent(6000, 12000)).toBe(50);
    expect(actualDiscountPercent(100, 0)).toBe(0);
    expect(actualDiscountPercent(12000, 12000)).toBe(0);
  });

  it('writes prices the way the settings expect', () => {
    expect(asPriceText(900)).toBe('900');
    expect(asPriceText(4333.333)).toBe('4333.33');
  });
});
