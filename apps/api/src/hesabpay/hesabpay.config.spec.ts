import { ConfigService } from '@nestjs/config';
import { readHesabPaySettings } from './hesabpay.config.js';

const config = (env: Record<string, string>) =>
  new ConfigService(env);

const SECRET = 'a-webhook-secret-of-16+chars';
const LIVE_ENV = {
  HESABPAY_MODE: 'live',
  HESABPAY_API_KEY: 'key',
  HESABPAY_PRICE_SUBSCRIPTION_MONTHLY: '1000',
  HESABPAY_PRICE_SUBSCRIPTION_QUARTERLY: '2700',
  HESABPAY_PRICE_SUBSCRIPTION_YEARLY: '9600',
  HESABPAY_PRICE_LADDER: '50',
  HESABPAY_PRICE_FEATURED_AD: '100',
  HESABPAY_PRICE_MAP_LOCATION: '30',
  HESABPAY_PRICE_CONTACT_CREDITS: '40',
  HESABPAY_CONTACT_CREDITS_PER_PACK: '10',
  HESABPAY_FEATURED_AD_DAYS: '7',
};

describe('readHesabPaySettings', () => {
  it('runs in mock mode with placeholder prices when nothing but a secret is set', () => {
    const s = readHesabPaySettings(config({ HESABPAY_WEBHOOK_SECRET: SECRET }));
    expect(s.mode).toBe('mock');
    expect(s.currency).toBe('AFGHANI');
    expect(s.prices.subscription.MONTHLY).toBe('1000');
    expect(s.featuredAdDays).toBe(7);
    expect(s.prices.contactCredits).toBe('40');
    expect(s.contactCreditsPerPack).toBe(10);
    expect(s.baseUrl).toBe('https://api.hesab.com/api/v1');
  });

  it('refuses mock mode in production, whether chosen or defaulted', () => {
    expect(() => readHesabPaySettings(config({ NODE_ENV: 'production', HESABPAY_MODE: 'mock', HESABPAY_WEBHOOK_SECRET: SECRET }))).toThrow(/not allowed in production/);
    // Unset mode defaults to live in production, which then demands real config.
    expect(() => readHesabPaySettings(config({ NODE_ENV: 'production' }))).toThrow(/HESABPAY_API_KEY/);
  });

  it('requires a long webhook secret in mock mode', () => {
    expect(() => readHesabPaySettings(config({}))).toThrow(/at least 16/);
    expect(() => readHesabPaySettings(config({ HESABPAY_WEBHOOK_SECRET: 'short' }))).toThrow(/at least 16/);
  });

  it('accepts a fully specified live configuration and trims the base URL', () => {
    const s = readHesabPaySettings(config({ ...LIVE_ENV, HESABPAY_BASE_URL: 'https://example.test/v1///' }));
    expect(s).toMatchObject({ mode: 'live', apiKey: 'key', baseUrl: 'https://example.test/v1' });
  });

  it.each(Object.keys(LIVE_ENV).filter((k) => k !== 'HESABPAY_MODE'))('refuses live mode without %s', (name) => {
    const env: Record<string, string> = { ...LIVE_ENV };
    delete env[name];
    expect(() => readHesabPaySettings(config(env))).toThrow(new RegExp(name));
  });

  it.each([
    ['HESABPAY_PRICE_LADDER', '10.999'],
    ['HESABPAY_PRICE_LADDER', '0'],
    ['HESABPAY_PRICE_LADDER', '-5'],
    ['HESABPAY_PRICE_LADDER', '1e3'],
    ['HESABPAY_PRICE_SUBSCRIPTION_YEARLY', 'free'],
    ['HESABPAY_FEATURED_AD_DAYS', '0'],
    ['HESABPAY_FEATURED_AD_DAYS', '2.5'],
    ['HESABPAY_FEATURED_AD_DAYS', '4000'],
    ['HESABPAY_CONTACT_CREDITS_PER_PACK', '0'],
    ['HESABPAY_CONTACT_CREDITS_PER_PACK', '2.5'],
    ['HESABPAY_CONTACT_CREDITS_PER_PACK', '10000'],
    ['HESABPAY_PRICE_CONTACT_CREDITS', '0'],
    ['HESABPAY_CURRENCY', 'EUR'],
    ['HESABPAY_MODE', 'sandbox'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => readHesabPaySettings(config({ ...LIVE_ENV, [name]: value }))).toThrow();
  });
});
