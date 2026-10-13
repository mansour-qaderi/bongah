import { PricingKey } from '../generated/prisma/client.js';
import type { HesabPaySettings } from './hesabpay.config.js';
import { PricingService } from './pricing.service.js';

const settings = {
  currency: 'AFGHANI',
  featuredAdDays: 7,
  contactCreditsPerPack: 10,
  prices: {
    subscription: { MONTHLY: '1000', QUARTERLY: '2700', YEARLY: '9600' },
    ladder: '50',
    featuredAd: '100.50',
    mapLocation: '30',
    contactCredits: '40',
  },
} as unknown as HesabPaySettings;

/** Only the parts of Prisma the price list touches. */
function service(overrides: { key: PricingKey; price: number; quantity: number | null }[] = []) {
  const prisma = {
    pricingOverride: {
      findMany: async () => overrides.map((o) => ({ ...o, price: { toFixed: (n: number) => o.price.toFixed(n), toNumber: () => o.price }, updatedAt: new Date('2026-10-01T00:00:00Z') })),
    },
  };
  return new PricingService(prisma as never, settings);
}

describe('PricingService', () => {
  it('uses the environment defaults when nothing is overridden', async () => {
    const pricing = service();
    const effective = await pricing.effective();
    expect(effective.LADDER).toEqual({ price: '50', quantity: null });
    expect(effective.FEATURED_AD).toEqual({ price: '100.50', quantity: 7 });
    expect(effective.CONTACT_CREDITS).toEqual({ price: '40', quantity: 10 });
    expect(pricing.toWire(effective)).toEqual({
      currency: 'AFGHANI',
      subscription: { MONTHLY: 1000, QUARTERLY: 2700, YEARLY: 9600 },
      ladder: 50,
      featured_ad: 100.5,
      map_location: 30,
      featured_ad_days: 7,
      contact_credits: 40,
      contact_credits_per_pack: 10,
    });
  });

  it('puts an override on top: its price, and its quantity where it has one', async () => {
    const pricing = service([
      { key: PricingKey.LADDER, price: 75.25, quantity: null },
      { key: PricingKey.FEATURED_AD, price: 200, quantity: 3 },
      { key: PricingKey.SUBSCRIPTION_YEARLY, price: 9000, quantity: null },
    ]);
    const effective = await pricing.effective();
    expect(effective.LADDER).toEqual({ price: '75.25', quantity: null });
    expect(effective.FEATURED_AD).toEqual({ price: '200.00', quantity: 3 });
    expect(effective.MAP_LOCATION).toEqual({ price: '30', quantity: null }); // untouched
    const wire = pricing.toWire(effective);
    expect(wire).toMatchObject({ ladder: 75.25, featured_ad: 200, featured_ad_days: 3 });
    expect(wire.subscription.YEARLY).toBe(9000);
  });

  it('keeps the default quantity when an override sets only a price', async () => {
    const effective = await service([{ key: PricingKey.CONTACT_CREDITS, price: 99, quantity: null }]).effective();
    expect(effective.CONTACT_CREDITS).toEqual({ price: '99.00', quantity: 10 });
  });

  it('lists every product with whether it was changed', async () => {
    const list = await service([{ key: PricingKey.FEATURED_AD, price: 200, quantity: 3 }]).list();
    expect(list.map((entry) => entry.key)).toHaveLength(7);
    expect(list.find((e) => e.key === 'FEATURED_AD')).toMatchObject({
      price: 200,
      quantity: 3,
      overridden: true,
      default_price: 100.5,
      default_quantity: 7,
      updated_at: '2026-10-01T00:00:00.000Z',
    });
    expect(list.find((e) => e.key === 'LADDER')).toMatchObject({ price: 50, overridden: false, updated_at: null });
  });
});
