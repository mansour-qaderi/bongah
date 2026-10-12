import { ConfigService } from '@nestjs/config';
import { CURRENCIES, SUBSCRIPTION_PACKAGES } from '@bongah/shared-types';
import type { Currency, SubscriptionPackage } from '../generated/prisma/client.js';

export const HESABPAY_SETTINGS = Symbol('HESABPAY_SETTINGS');

export interface HesabPaySettings {
  /** "mock" never contacts HesabPay and is refused in production. */
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
  };
  featuredAdDays: number;
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
} as const;

const PRICE_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/** Reads and validates all payment settings once, so bad config fails at startup, not at the first payment. */
export function readHesabPaySettings(config: ConfigService): HesabPaySettings {
  const production = config.get<string>('NODE_ENV') === 'production';
  const mode = config.get<string>('HESABPAY_MODE') ?? (production ? 'live' : 'mock');
  if (mode !== 'mock' && mode !== 'live') {
    throw new Error('HESABPAY_MODE must be "mock" or "live".');
  }
  if (mode === 'mock' && production) {
    throw new Error(
      'HESABPAY_MODE=mock is not allowed in production: payments would never be charged.',
    );
  }

  const text = (name: string): string => config.get<string>(name)?.trim() ?? '';
  const required = (name: string): string => {
    const value = text(name);
    if (!value) throw new Error(`${name} must be set.`);
    return value;
  };

  const apiKey = mode === 'live' ? required('HESABPAY_API_KEY') : text('HESABPAY_API_KEY');
  // Mock webhooks are signed with this secret, so it must be unguessable even in dev.
  const webhookSecret = text('HESABPAY_WEBHOOK_SECRET');
  if (mode === 'mock' && webhookSecret.length < 16) {
    throw new Error('HESABPAY_WEBHOOK_SECRET must be at least 16 characters in mock mode.');
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
    },
    featuredAdDays,
  };
}
