import { bundleListPrice, bundlePrice, featuredBundles } from './featured-bundles.js';

describe('featured bundles', () => {
  it('prices 3, 5, 10 and 20 at 10%, 20%, 35% and 45% off the one-by-one price of 100', () => {
    expect(bundleListPrice(100, 3)).toBe(300);
    expect(bundlePrice(100, 3)).toBe(270);
    expect(bundlePrice(100, 5)).toBe(400);
    expect(bundlePrice(100, 10)).toBe(650);
    expect(bundleListPrice(100, 20)).toBe(2000);
    expect(bundlePrice(100, 20)).toBe(1100);
  });

  it('lists the bundles with the discount they really give', () => {
    expect(featuredBundles(100)).toEqual([
      { size: 3, price: 270, list_price: 300, discount_percent: 10 },
      { size: 5, price: 400, list_price: 500, discount_percent: 20 },
      { size: 10, price: 650, list_price: 1000, discount_percent: 35 },
      { size: 20, price: 1100, list_price: 2000, discount_percent: 45 },
    ]);
  });

  it('follows the single price, rounded to two decimals', () => {
    expect(bundlePrice(33.33, 3)).toBe(89.99);
  });
});
