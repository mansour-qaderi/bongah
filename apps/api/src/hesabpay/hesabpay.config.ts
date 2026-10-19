import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CURRENCIES, SUBSCRIPTION_PACKAGES } from '@bongah/shared-types';
import type { Currency, SubscriptionPackage } from '../generated/prisma/client.js';

export const HESABPAY_SETTINGS = Symbol('HESABPAY_SETTINGS');

export interface HesabPaySettings {
  /** "mock" never contacts HesabPay and charges nobody. In production it is only used when chosen on purpose, or as the fallback for a missing HESABPAY_API_KEY (with a warning). */
  mode: 'mock' | 'live';
  baseUrl: string;
  apiKey: string;
  /** Signs/verifies webhooks in mock mode. (Live webhooks are verified by HesabPay itself.) */
  webhookSecret: string;
  currency: Currency;
  /** Prices as decimal strings with at most 2 decimals. Decided here, never by the client. */
  prices: {
    subscription: Record<SubscriptionPackage, string>;
    ladder: string;
    featuredAd: string;
    /** One exact map pin on one listing, for accounts without an agency subscription. */
    mapLocation: string;
    /** One pack of contact reveal credits (see contactCreditsPerPack). */
    contactCredits: string;
  };
  featuredAdDays: number;
  /** How many contact reveal credits one pack contains. Stored on the payment when it is started. */
  contactCreditsPerPack: number;
}

const DEFAULT_BASE_URL = 'https://api.hesab.com/api/v1';

/** Placeholders so the app runs locally. Live mode refuses to start without explicit prices. */
const MOCK_DEFAULT_PRICES = {
  HESABPAY_PRICE_SUBSCRIPTION_MONTHLY: '1000',
  HESABPAY_PRICE_SUBSCRIPTION_QUARTERLY: '2700',
  HESABPAY_PRICE_SUBSCRIPTION_YEARLY: '9600',
  HESABPAY_PRICE_LADDER: '50',
  HESABPAY_PRICE_FEATURED_AD: '100',
  HESABPAY_PRICE_MAP_LOCATION: '30',
  HESABPAY_PRICE_CONTACT_CREDITS: '40',
} as const;

const MOCK_DEFAULT_CONTACT_CREDITS_PER_PACK = '10';

const PRICE_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** Reads and validates all payment settings once, so bad config fails at startup, not at the first payment. */
export function readHesabPaySettings(config: ConfigService): HesabPaySettings {
  const production = config.get<string>('NODE_ENV') === 'production';
  const logger = new Logger('HesabPayConfig');
  const requested = config.get<string>('HESABPAY_MODE')?.trim() || (production ? 'live' : 'mock');
  if (requested !== 'mock' && requested !== 'live') {
    throw new Error('HESABPAY_MODE must be "mock" or "live".');
  }

  const text = (name: string): string => config.get<string>(name)?.trim() ?? '';
  let mode: HesabPaySettings['mode'] = requested;
  if (mode === 'live' && !text('HESABPAY_API_KEY')) {
    // Staging/testing deployments (e.g. on Render) often have no HesabPay account yet. Only a MISSING key falls
    // back; with a key present, missing prices still fail the startup because they decide what real money is charged.
    logger.warn(
      'HESABPAY_API_KEY is not set: falling back to the mock payment gateway. Nobody will be charged and no real ' +
        'payment can be completed. Set HESABPAY_API_KEY (and the prices) to take real payments.',
    );
    mode = 'mock';
  } else if (mode === 'mock' && production) {
    logger.warn('HESABPAY_MODE=mock in production: payments are simulated and nobody is charged. Use for testing only.');
  }
  const required = (name: string): string => {
    const value = text(name);
    if (!value) throw new Error(`${name} must be set.`);
    return value;
  };

  const apiKey = mode === 'live' ? required('HESABPAY_API_KEY') : text('HESABPAY_API_KEY');
  // Mock webhooks are signed with this secret, so it must be unguessable even in dev.
  let webhookSecret = text('HESABPAY_WEBHOOK_SECRET');
  if (mode === 'mock' && webhookSecret.length < 16) {
    if (!production) throw new Error('HESABPAY_WEBHOOK_SECRET must be at least 16 characters in mock mode.');
    // Never fall back to a guessable secret: anyone who could sign a mock webhook could mark payments as paid.
    // A random one closes the webhook until a real secret is set (it changes on every restart).
    webhookSecret = randomBytes(32).toString('hex');
    logger.warn(
      'HESABPAY_WEBHOOK_SECRET is missing or shorter than 16 characters: using a random one for this run, so mock ' +
        'webhooks cannot be signed from outside. Set it to a secret of 16+ characters to test the webhook.',
    );
  }

  const currency = (text('HESABPAY_CURRENCY') || 'AFGHANI') as Currency;
  if (!(CURRENCIES as readonly string[]).includes(currency)) {
    throw new Error(`HESABPAY_CURRENCY must be one of: ${CURRENCIES.join(', ')}.`);
  }

  const price = (name: keyof typeof MOCK_DEFAULT_PRICES): string => {
    const raw = mode === 'live' ? required(name) : text(name) || MOCK_DEFAULT_PRICES[name];
    if (!PRICE_PATTERN.test(raw) || Number(raw) <= 0) {
      throw new Error(`${name} must be a positive amount with at most 2 decimals (got "${raw}").`);
    }
    return raw;
  };

  const rawDays = mode === 'live' ? required('HESABPAY_FEATURED_AD_DAYS') : text('HESABPAY_FEATURED_AD_DAYS') || '7';
  const featuredAdDays = Number(rawDays);
  if (!Number.isInteger(featuredAdDays) || featuredAdDays < 1 || featuredAdDays > 365) {
    throw new Error('HESABPAY_FEATURED_AD_DAYS must be a whole number of days between 1 and 365.');
  }

  const rawPack =
    mode === 'live'
      ? required('HESABPAY_CONTACT_CREDITS_PER_PACK')
      : text('HESABPAY_CONTACT_CREDITS_PER_PACK') || MOCK_DEFAULT_CONTACT_CREDITS_PER_PACK;
  const contactCreditsPerPack = Number(rawPack);
  if (!/^\d{1,4}$/.test(rawPack) || contactCreditsPerPack < 1) {
    throw new Error('HESABPAY_CONTACT_CREDITS_PER_PACK must be a whole number between 1 and 9999.');
  }

  const subscription = Object.fromEntries(
    SUBSCRIPTION_PACKAGES.map((pkg) => [
      pkg,
      price(`HESABPAY_PRICE_SUBSCRIPTION_${pkg}` as keyof typeof MOCK_DEFAULT_PRICES),
    ]),
  ) as Record<SubscriptionPackage, string>;

  return {
    mode,
    baseUrl: (text('HESABPAY_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey,
    webhookSecret,
    currency,
    prices: {
      subscription,
      ladder: price('HESABPAY_PRICE_LADDER'),
      featuredAd: price('HESABPAY_PRICE_FEATURED_AD'),
      mapLocation: price('HESABPAY_PRICE_MAP_LOCATION'),
      contactCredits: price('HESABPAY_PRICE_CONTACT_CREDITS'),
    },
    featuredAdDays,
    contactCreditsPerPack,
  };
}
