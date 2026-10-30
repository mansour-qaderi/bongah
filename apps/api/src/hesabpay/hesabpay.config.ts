import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CURRENCIES,
  DEFAULT_MARKET,
  SUBSCRIPTION_BASE_MONTHLY_PRICE,
  SUBSCRIPTION_PACKAGES,
  type Market,
  type ManualPaymentAccount,
  type ManualPaymentInfo,
} from '@bongah/shared-types';
import type { Currency, SubscriptionPackage } from '../generated/prisma/client.js';
import { asPriceText, defaultPriceOf } from './subscription-prices.js';

export const HESABPAY_SETTINGS = Symbol('HESABPAY_SETTINGS');

/** What a customer pays and where the money goes, for one market. Afghanistan's are the top-level settings below. */
export interface MarketPaymentSettings {
  currency: Currency;
  /** Prices as decimal strings with at most 2 decimals. Decided here, never by the client. */
  prices: HesabPaySettings['prices'];
  /** Where a manual payment is sent. */
  manual: ManualPaymentInfo;
}

export interface HesabPaySettings {
  /**
   * "mock" never contacts HesabPay and charges nobody. In production it is only used when chosen on purpose, or as the
   * fallback for a missing HESABPAY_API_KEY (with a warning).
   * "manual" takes real money without a payment provider: the customer sends it to the accounts in `manual` (HesabPay
   * app or card-to-card), uploads a picture of the receipt, and an admin confirms it. No webhook is accepted.
   */
  mode: 'mock' | 'live' | 'manual';
  baseUrl: string;
  apiKey: string;
  /**
   * Test checkout: in mock mode only, a payment is settled the moment it is started, through the same delivery a
   * real webhook triggers (plan, credits, receipt), so nobody has to sign a webhook by hand. Always false in live
   * mode. HESABPAY_MOCK_AUTO_SUCCESS=true.
   */
  mockAutoSuccess: boolean;
  /** Signs/verifies webhooks in mock mode. (Live webhooks are verified by HesabPay itself.) */
  webhookSecret: string;
  currency: Currency;
  /** Prices as decimal strings with at most 2 decimals. Decided here, never by the client. */
  prices: {
    subscription: Record<SubscriptionPackage, string>;
    /**
     * What one month costs without a discount: the one number every plan is priced from. The plans' list prices (and
     * so the discounts the app shows) are this times their months. HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY, or 1000.
     */
    subscriptionListMonthly: string;
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
  /** Where a manual payment is sent (mode "manual"; empty otherwise). */
  manual: ManualPaymentInfo;
  /**
   * Iran's payments, or null when no Iranian account is set (then an Iranian account cannot pay for anything). Iran has
   * no gateway: every Iranian payment is a manual one (card-to-card / Sheba transfer, receipt, an admin's approval),
   * whatever HESABPAY_MODE says for Afghanistan. Set by IR_* and MANUAL_PAY_IR_* (see readIranPayments).
   */
  iran: MarketPaymentSettings | null;
  /** The largest receipt picture a customer may upload (MANUAL_PAY_PROOF_MAX_BYTES). */
  proofMaxBytes: number;
  /** Where receipt pictures are kept (UPLOAD_DIR, like the chat pictures). Production needs object storage, see ChatImageStorage. */
  uploadDir: string;
}

export const DEFAULT_PROOF_MAX_BYTES = 5_000_000;

const DEFAULT_BASE_URL = 'https://api.hesab.com/api/v1';

/**
 * Placeholders so the app runs locally. Live mode refuses to start without explicit prices. (The subscription plans
 * are not among them: they are priced from one monthly list price, below.)
 */
const MOCK_DEFAULT_PRICES = {
  HESABPAY_PRICE_LADDER: '50',
  HESABPAY_PRICE_FEATURED_AD: '100',
  HESABPAY_PRICE_MAP_LOCATION: '30',
  HESABPAY_PRICE_CONTACT_CREDITS: '40',
} as const;

const MOCK_DEFAULT_CONTACT_CREDITS_PER_PACK = '10';

const PRICE_PATTERN = /^\d{1,14}(\.\d{1,2})?$/;

/** Reads and validates all payment settings once, so bad config fails at startup, not at the first payment. */
export function readHesabPaySettings(config: ConfigService): HesabPaySettings {
  const production = config.get<string>('NODE_ENV') === 'production';
  const logger = new Logger('HesabPayConfig');
  const requested = config.get<string>('HESABPAY_MODE')?.trim() || (production ? 'live' : 'mock');
  if (requested !== 'mock' && requested !== 'live' && requested !== 'manual') {
    throw new Error('HESABPAY_MODE must be "mock", "live" or "manual".');
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
  // Live and manual both take real money, so what they charge is never left to a placeholder.
  const realMoney = mode !== 'mock';

  const autoRaw = text('HESABPAY_MOCK_AUTO_SUCCESS').toLowerCase();
  if (autoRaw && !['true', 'false', '1', '0'].includes(autoRaw)) {
    throw new Error('HESABPAY_MOCK_AUTO_SUCCESS must be "true" or "false".');
  }
  const wantsAutoSuccess = autoRaw === 'true' || autoRaw === '1';
  // Real money is never auto-approved: the flag only counts when the gateway is the mock one.
  const mockAutoSuccess = wantsAutoSuccess && mode === 'mock';
  if (wantsAutoSuccess && mode !== 'mock') {
    logger.warn(`HESABPAY_MOCK_AUTO_SUCCESS is ignored in ${mode} mode: real payments are only completed by ${mode === 'live' ? 'HesabPay' : 'an admin'}.`);
  } else if (mockAutoSuccess) {
    logger.warn(
      'HESABPAY_MOCK_AUTO_SUCCESS is on: every purchase succeeds instantly and nobody is charged. ' +
        (production ? 'THIS IS PRODUCTION: everyone gets plans and credits for free. ' : '') +
        'Turn it off to take real payments.',
    );
  }
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
    const raw = realMoney ? required(name) : text(name) || MOCK_DEFAULT_PRICES[name];
    if (!PRICE_PATTERN.test(raw) || Number(raw) <= 0) {
      throw new Error(`${name} must be a positive amount with at most 2 decimals (got "${raw}").`);
    }
    return raw;
  };

  const rawDays = realMoney ? required('HESABPAY_FEATURED_AD_DAYS') : text('HESABPAY_FEATURED_AD_DAYS') || '7';
  const featuredAdDays = Number(rawDays);
  if (!Number.isInteger(featuredAdDays) || featuredAdDays < 1 || featuredAdDays > 365) {
    throw new Error('HESABPAY_FEATURED_AD_DAYS must be a whole number of days between 1 and 365.');
  }

  const rawPack =
    realMoney
      ? required('HESABPAY_CONTACT_CREDITS_PER_PACK')
      : text('HESABPAY_CONTACT_CREDITS_PER_PACK') || MOCK_DEFAULT_CONTACT_CREDITS_PER_PACK;
  const contactCreditsPerPack = Number(rawPack);
  if (!/^\d{1,4}$/.test(rawPack) || contactCreditsPerPack < 1) {
    throw new Error('HESABPAY_CONTACT_CREDITS_PER_PACK must be a whole number between 1 and 9999.');
  }

  // The four plans are priced from ONE number, the monthly list price, so the discounts (10% a month, 20% for 3, 35%
  // for 6, 50% for a year) are true by construction. Per-plan settings used to exist; they are ignored now, because
  // an old value would quietly contradict the discount the app advertises. A price can still be set on purpose, per
  // plan, by an admin (the price list in the admin panel), which is an audited decision and wins over these.
  const rawList = text('HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY');
  if (rawList && (!PRICE_PATTERN.test(rawList) || Number(rawList) <= 0)) {
    throw new Error(`HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY must be a positive amount with at most 2 decimals (got "${rawList}").`);
  }
  const subscriptionListMonthly = rawList || asPriceText(SUBSCRIPTION_BASE_MONTHLY_PRICE);
  const subscription = Object.fromEntries(
    SUBSCRIPTION_PACKAGES.map((pkg) => [pkg, asPriceText(defaultPriceOf(Number(subscriptionListMonthly), pkg))]),
  ) as Record<SubscriptionPackage, string>;
  const ignored = SUBSCRIPTION_PACKAGES.filter((pkg) => text(`HESABPAY_PRICE_SUBSCRIPTION_${pkg}`));
  if (ignored.length > 0) {
    logger.warn(
      `${ignored.map((pkg) => `HESABPAY_PRICE_SUBSCRIPTION_${pkg}`).join(', ')} ${ignored.length === 1 ? 'is' : 'are'} ` +
        `ignored: the plans are priced from HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY (${subscriptionListMonthly} a month, ` +
        `${SUBSCRIPTION_PACKAGES.map((pkg) => `${subscription[pkg]} for ${pkg}`).join(', ')}). Delete the old settings.`,
    );
  }

  return {
    mode,
    mockAutoSuccess,
    baseUrl: (text('HESABPAY_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey,
    webhookSecret,
    currency,
    prices: {
      subscription,
      subscriptionListMonthly,
      ladder: price('HESABPAY_PRICE_LADDER'),
      featuredAd: price('HESABPAY_PRICE_FEATURED_AD'),
      mapLocation: price('HESABPAY_PRICE_MAP_LOCATION'),
      contactCredits: price('HESABPAY_PRICE_CONTACT_CREDITS'),
    },
    featuredAdDays,
    contactCreditsPerPack,
    manual: mode === 'manual' ? readManualPayment(text) : { accounts: [], note: null },
    iran: readIranPayments(text, { realMoney }, logger),
    proofMaxBytes: proofMaxBytes(text('MANUAL_PAY_PROOF_MAX_BYTES')),
    uploadDir: text('UPLOAD_DIR') || join(tmpdir(), 'bongah-uploads'),
  };
}

function proofMaxBytes(raw: string): number {
  if (!raw) return DEFAULT_PROOF_MAX_BYTES;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 100_000 || value > 50_000_000) {
    throw new Error('MANUAL_PAY_PROOF_MAX_BYTES must be a whole number of bytes between 100000 and 50000000.');
  }
  return value;
}

/**
 * The accounts a customer sends a manual payment to, from the environment: a HesabPay wallet (the phone number it is
 * registered to), a bank card, or both. At least one is required: a manual payment screen with nowhere to send the
 * money would take orders nobody can pay. Nothing here is a default: these are the operator's own accounts.
 */
function readManualPayment(text: (name: string) => string): ManualPaymentInfo {
  const accounts: ManualPaymentAccount[] = [];
  const account = (kind: ManualPaymentAccount['kind'], numberVar: string, holderVar: string, bank: string | null) => {
    const number = text(numberVar);
    const holder = text(holderVar);
    if (!number && !holder) return;
    if (!number || !holder) throw new Error(`${numberVar} and ${holderVar} must be set together.`);
    if (number.length > 40 || !/\d{6,}/.test(number.replace(/[\s\-+()]/g, ''))) {
      throw new Error(`${numberVar} must be a phone or card number (digits, spaces and dashes).`);
    }
    if (holder.length > 80) throw new Error(`${holderVar} must be at most 80 characters.`);
    accounts.push({ kind, number, holder, bank });
  };
  account('HESABPAY', 'MANUAL_PAY_HESABPAY_PHONE', 'MANUAL_PAY_HESABPAY_HOLDER', null);
  account('CARD', 'MANUAL_PAY_CARD_NUMBER', 'MANUAL_PAY_CARD_HOLDER', text('MANUAL_PAY_CARD_BANK') || null);
  if (accounts.length === 0) {
    throw new Error(
      'HESABPAY_MODE=manual needs somewhere to send the money: set MANUAL_PAY_HESABPAY_PHONE and ' +
        'MANUAL_PAY_HESABPAY_HOLDER, or MANUAL_PAY_CARD_NUMBER and MANUAL_PAY_CARD_HOLDER (or both).',
    );
  }
  const note = text('MANUAL_PAY_NOTE');
  if (note.length > 300) throw new Error('MANUAL_PAY_NOTE must be at most 300 characters.');
  return { accounts, note: note || null };
}

// ───────────────────────────── Iran ─────────────────────────────

/** What a month of the Iranian plans costs before a discount, when nothing is set (a placeholder: real money needs the setting). */
const IR_MOCK_LIST_MONTHLY = '2000000';
const IR_MOCK_DEFAULT_PRICES = {
  IR_PRICE_LADDER: '50000',
  IR_PRICE_FEATURED_AD: '100000',
  IR_PRICE_MAP_LOCATION: '30000',
  IR_PRICE_CONTACT_CREDITS: '40000',
} as const;

/** A card number passes the Luhn check (every Iranian bank card does), so a mistyped digit is caught at startup. */
export function isValidCardNumber(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(digits[15 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** A Sheba number: "IR" + 24 digits, with a valid IBAN check (mod 97), so a mistyped digit is caught at startup. */
export function isValidSheba(sheba: string): boolean {
  if (!/^IR\d{24}$/.test(sheba)) return false;
  const rearranged = sheba.slice(4) + sheba.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

/**
 * Iran's payment settings, or null when no Iranian account is configured (card or Sheba). Iranian customers pay the
 * platform by card-to-card or a Sheba (Paya / Satna) transfer to the operator's own account, upload the receipt, and an
 * admin confirms it: the same manual flow as MANUAL mode, always, because there is no gateway.
 *
 *   MANUAL_PAY_IR_CARD_NUMBER, MANUAL_PAY_IR_CARD_HOLDER, MANUAL_PAY_IR_CARD_BANK   the card (16 digits, Luhn-checked)
 *   MANUAL_PAY_IR_SHEBA, MANUAL_PAY_IR_SHEBA_HOLDER, MANUAL_PAY_IR_SHEBA_BANK       the Sheba ("IR" + 24 digits, checked);
 *                                                                                    holder and bank default to the card's
 *   MANUAL_PAY_IR_NOTE                                                               an extra line shown with them
 *   IR_CURRENCY                  TOMAN (default) or RIAL: what the prices below are in
 *   IR_PRICE_SUBSCRIPTION_LIST_MONTHLY, IR_PRICE_LADDER, IR_PRICE_FEATURED_AD, IR_PRICE_MAP_LOCATION,
 *   IR_PRICE_CONTACT_CREDITS     the prices; required when real money is taken, placeholders otherwise
 *
 * An admin's price changes (the price list in the admin panel) are Afghanistan's; Iran's prices change by editing these.
 */
function readIranPayments(
  text: (name: string) => string,
  shared: { realMoney: boolean },
  logger: Logger,
): MarketPaymentSettings | null {
  const compact = (value: string) => value.replace(/[\s\-]/g, '');
  const cardRaw = text('MANUAL_PAY_IR_CARD_NUMBER');
  const shebaRaw = text('MANUAL_PAY_IR_SHEBA');
  if (!cardRaw && !shebaRaw) {
    const stray = Object.keys(IR_MOCK_DEFAULT_PRICES).filter((name) => text(name));
    if (stray.length > 0) {
      logger.warn(`${stray.join(', ')} set, but no Iranian account (MANUAL_PAY_IR_CARD_NUMBER or MANUAL_PAY_IR_SHEBA): Iranian payments stay off.`);
    }
    return null;
  }

  const accounts: ManualPaymentAccount[] = [];
  const cardHolder = text('MANUAL_PAY_IR_CARD_HOLDER');
  const cardBank = text('MANUAL_PAY_IR_CARD_BANK') || null;
  if (cardRaw) {
    const card = compact(cardRaw);
    if (!isValidCardNumber(card)) throw new Error('MANUAL_PAY_IR_CARD_NUMBER must be a 16-digit bank card number (digits, spaces and dashes; the check digit must be right).');
    if (!cardHolder) throw new Error('MANUAL_PAY_IR_CARD_NUMBER needs MANUAL_PAY_IR_CARD_HOLDER.');
    if (cardHolder.length > 80) throw new Error('MANUAL_PAY_IR_CARD_HOLDER must be at most 80 characters.');
    accounts.push({ kind: 'CARD', number: card.replace(/(\d{4})(?=\d)/g, '$1 '), holder: cardHolder, bank: cardBank });
  }
  if (shebaRaw) {
    const sheba = compact(shebaRaw).toUpperCase();
    if (!isValidSheba(sheba)) throw new Error('MANUAL_PAY_IR_SHEBA must be "IR" followed by 24 digits (the check digits must be right).');
    const holder = text('MANUAL_PAY_IR_SHEBA_HOLDER') || cardHolder;
    if (!holder) throw new Error('MANUAL_PAY_IR_SHEBA needs MANUAL_PAY_IR_SHEBA_HOLDER (or MANUAL_PAY_IR_CARD_HOLDER).');
    if (holder.length > 80) throw new Error('MANUAL_PAY_IR_SHEBA_HOLDER must be at most 80 characters.');
    accounts.push({ kind: 'SHEBA', number: sheba, holder, bank: text('MANUAL_PAY_IR_SHEBA_BANK') || cardBank });
  }
  const note = text('MANUAL_PAY_IR_NOTE');
  if (note.length > 300) throw new Error('MANUAL_PAY_IR_NOTE must be at most 300 characters.');

  const currency = (text('IR_CURRENCY') || 'TOMAN') as Currency;
  if (currency !== 'TOMAN' && currency !== 'RIAL') throw new Error('IR_CURRENCY must be TOMAN or RIAL.');

  const amount = (name: string, fallback: string): string => {
    const given = text(name);
    if (!given && shared.realMoney) throw new Error(`${name} must be set.`);
    const raw = given || fallback;
    if (!PRICE_PATTERN.test(raw) || Number(raw) <= 0) {
      throw new Error(`${name} must be a positive amount with at most 2 decimals (got "${raw}").`);
    }
    return raw;
  };
  const listMonthly = amount('IR_PRICE_SUBSCRIPTION_LIST_MONTHLY', IR_MOCK_LIST_MONTHLY);
  const subscription = Object.fromEntries(
    SUBSCRIPTION_PACKAGES.map((pkg) => [pkg, asPriceText(defaultPriceOf(Number(listMonthly), pkg))]),
  ) as Record<SubscriptionPackage, string>;
  return {
    currency,
    manual: { accounts, note: note || null },
    prices: {
      subscription,
      subscriptionListMonthly: listMonthly,
      ladder: amount('IR_PRICE_LADDER', IR_MOCK_DEFAULT_PRICES.IR_PRICE_LADDER),
      featuredAd: amount('IR_PRICE_FEATURED_AD', IR_MOCK_DEFAULT_PRICES.IR_PRICE_FEATURED_AD),
      mapLocation: amount('IR_PRICE_MAP_LOCATION', IR_MOCK_DEFAULT_PRICES.IR_PRICE_MAP_LOCATION),
      contactCredits: amount('IR_PRICE_CONTACT_CREDITS', IR_MOCK_DEFAULT_PRICES.IR_PRICE_CONTACT_CREDITS),
    },
  };
}

/** A payment's settings for a market: the currency, the prices and where the money goes. Null: that market cannot pay. */
export function paymentSettingsFor(settings: HesabPaySettings, market: Market): MarketPaymentSettings | null {
  if (market === DEFAULT_MARKET) {
    return { currency: settings.currency, prices: settings.prices, manual: settings.manual };
  }
  return settings.iran;
}

/** How a payment in a market is settled: Iran always by hand, Afghanistan as HESABPAY_MODE says. */
export function settlesByHand(settings: HesabPaySettings, market: Market): boolean {
  return market !== DEFAULT_MARKET || settings.mode === 'manual';
}
