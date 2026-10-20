import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pricing, PricingEntry } from '@bongah/shared-types';
import { PRICING_KEYS, SUBSCRIPTION_PACKAGES, SUBSCRIPTION_PLAN_BENEFITS } from '@bongah/shared-types';
import type { SetPricingInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { Prisma, PricingKey } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HESABPAY_SETTINGS, type HesabPaySettings } from './hesabpay.config.js';
import { featuredBundles } from './featured-bundles.js';
import { listPriceOf } from './subscription-prices.js';

/** What one product costs right now (price as a decimal string, like the settings). */
export interface EffectivePrice {
  price: string;
  /** Featured days / credits per pack; null for products without one. */
  quantity: number | null;
}
export type EffectivePricing = Record<PricingKey, EffectivePrice>;

/** The products that come with a number: how many days / credits one purchase gives. */
const KEYS_WITH_QUANTITY: readonly PricingKey[] = [PricingKey.FEATURED_AD, PricingKey.CONTACT_CREDITS];
const MAX_QUANTITY: Partial<Record<PricingKey, number>> = {
  [PricingKey.FEATURED_AD]: 365,
  [PricingKey.CONTACT_CREDITS]: 9999,
};

/**
 * What customers pay. The HESABPAY_* environment settings are the defaults; an admin can override a
 * product's price (and its featured days / credit pack size) in the database, and removing the
 * override brings the default back. A payment records the price and quantity at the moment it is
 * started, so changing a price never changes what someone already agreed to pay.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(HESABPAY_SETTINGS) private readonly settings: HesabPaySettings,
  ) {}

  /** The environment defaults. */
  defaults(): EffectivePricing {
    const { prices, featuredAdDays, contactCreditsPerPack } = this.settings;
    return {
      SUBSCRIPTION_MONTHLY: { price: prices.subscription.MONTHLY, quantity: null },
      SUBSCRIPTION_QUARTERLY: { price: prices.subscription.QUARTERLY, quantity: null },
      SUBSCRIPTION_SEMIANNUAL: { price: prices.subscription.SEMIANNUAL, quantity: null },
      SUBSCRIPTION_YEARLY: { price: prices.subscription.YEARLY, quantity: null },
      LADDER: { price: prices.ladder, quantity: null },
      FEATURED_AD: { price: prices.featuredAd, quantity: featuredAdDays },
      MAP_LOCATION: { price: prices.mapLocation, quantity: null },
      CONTACT_CREDITS: { price: prices.contactCredits, quantity: contactCreditsPerPack },
    };
  }

  /** Defaults with the admin's overrides on top. */
  async effective(db: Prisma.TransactionClient = this.prisma): Promise<EffectivePricing> {
    const result = this.defaults();
    for (const row of await db.pricingOverride.findMany()) {
      result[row.key] = {
        price: row.price.toFixed(2),
        quantity: row.quantity ?? result[row.key].quantity,
      };
    }
    return result;
  }

  /** The public price list (GET /hesabpay/pricing). */
  toWire(pricing: EffectivePricing): Pricing {
    const price = (key: PricingKey) => Number(pricing[key].price);
    return {
      currency: this.settings.currency,
      subscription: Object.fromEntries(
        SUBSCRIPTION_PACKAGES.map((pkg) => [pkg, price(`SUBSCRIPTION_${pkg}` as PricingKey)]),
      ) as Pricing['subscription'],
      subscription_list: Object.fromEntries(
        SUBSCRIPTION_PACKAGES.map((pkg) => [pkg, listPriceOf(Number(this.settings.prices.subscriptionListMonthly), pkg)]),
      ) as Pricing['subscription'],
      ladder: price('LADDER'),
      featured_ad: price('FEATURED_AD'),
      map_location: price('MAP_LOCATION'),
      featured_ad_days: pricing.FEATURED_AD.quantity ?? this.settings.featuredAdDays,
      contact_credits: price('CONTACT_CREDITS'),
      contact_credits_per_pack: pricing.CONTACT_CREDITS.quantity ?? this.settings.contactCreditsPerPack,
      featured_bundles: featuredBundles(price('FEATURED_AD')),
      plans: SUBSCRIPTION_PLAN_BENEFITS,
    };
  }

  /** The admin price list: every product, what it costs now and what the default is. */
  async list(): Promise<PricingEntry[]> {
    const [rows, defaults] = [await this.prisma.pricingOverride.findMany(), this.defaults()];
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return PRICING_KEYS.map((key): PricingEntry => {
      const override = byKey.get(key);
      return {
        key,
        price: override ? override.price.toNumber() : Number(defaults[key].price),
        quantity: override?.quantity ?? defaults[key].quantity,
        overridden: override !== undefined,
        default_price: Number(defaults[key].price),
        default_quantity: defaults[key].quantity,
        updated_at: override?.updatedAt.toISOString() ?? null,
      };
    });
  }

  /** Sets a product's price (and days / pack size where the product has one). */
  async set(actorId: string, key: PricingKey, input: SetPricingInput): Promise<PricingEntry[]> {
    if (input.quantity !== undefined) {
      if (!KEYS_WITH_QUANTITY.includes(key)) {
        throw new BadRequestException({
          message: 'This product has no quantity to set.',
          code: 'PRICING_QUANTITY_NOT_APPLICABLE',
        });
      }
      if (input.quantity > (MAX_QUANTITY[key] ?? 9999)) {
        throw new BadRequestException({
          message: `The most allowed is ${MAX_QUANTITY[key]}.`,
          code: 'PRICING_QUANTITY_TOO_LARGE',
        });
      }
    }

    await this.prisma.$transaction(async (db) => {
      const before = await db.pricingOverride.findUnique({ where: { key } });
      const row = await db.pricingOverride.upsert({
        where: { key },
        create: { key, price: input.price, quantity: input.quantity ?? null, updatedById: actorId },
        update: { price: input.price, quantity: input.quantity ?? null, updatedById: actorId },
      });
      await recordAudit(db, {
        actorId,
        action: 'PRICE_CHANGED',
        targetType: 'pricing',
        targetId: key,
        metadata: {
          from_price: before?.price.toNumber() ?? Number(this.defaults()[key].price),
          to_price: row.price.toNumber(),
          to_quantity: row.quantity,
        },
      });
    });
    return this.list();
  }

  /** Removes the override: the environment default applies again. */
  async reset(actorId: string, key: PricingKey): Promise<PricingEntry[]> {
    await this.prisma.$transaction(async (db) => {
      const removed = await db.pricingOverride.deleteMany({ where: { key } });
      if (removed.count > 0) {
        await recordAudit(db, { actorId, action: 'PRICE_RESET', targetType: 'pricing', targetId: key });
      }
    });
    return this.list();
  }
}
