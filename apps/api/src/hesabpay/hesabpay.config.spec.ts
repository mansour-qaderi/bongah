import { ConfigService } from '@nestjs/config';
import { readHesabPaySettings } from './hesabpay.config.js';

const config = (env: Record<string, string>) =>
  new ConfigService(env);

const SECRET = 'a-webhook-secret-of-16+chars';
const LIVE_ENV = {
  HESABPAY_MODE: 'live',
  HESABPAY_API_KEY: 'key',
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
    expect(s.prices.subscription).toEqual({ MONTHLY: '900', QUARTERLY: '2400', SEMIANNUAL: '3900', YEARLY: '6000' });
    expect(s.prices.subscriptionListMonthly).toBe('1000');
    expect(s.featuredAdDays).toBe(7);
    expect(s.prices.contactCredits).toBe('40');
    expect(s.contactCreditsPerPack).toBe(10);
    expect(s.baseUrl).toBe('https://api.hesab.com/api/v1');
  });

  it('auto-success is off unless asked for, and only ever applies to the mock gateway', () => {
    const base = { HESABPAY_WEBHOOK_SECRET: SECRET };
    expect(readHesabPaySettings(config(base)).mockAutoSuccess).toBe(false);
    expect(readHesabPaySettings(config({ ...base, HESABPAY_MOCK_AUTO_SUCCESS: 'true' })).mockAutoSuccess).toBe(true);
    expect(readHesabPaySettings(config({ ...base, HESABPAY_MOCK_AUTO_SUCCESS: '1' })).mockAutoSuccess).toBe(true);
    expect(readHesabPaySettings(config({ ...base, HESABPAY_MOCK_AUTO_SUCCESS: 'false' })).mockAutoSuccess).toBe(false);
    // Live mode: the flag is ignored, real payments are never auto-approved.
    expect(readHesabPaySettings(config({ ...LIVE_ENV, HESABPAY_MOCK_AUTO_SUCCESS: 'true' })).mockAutoSuccess).toBe(false);
    // A key-less "live" deployment falls back to the mock gateway, where the flag does apply.
    const { HESABPAY_API_KEY: _key, ...keyless } = LIVE_ENV;
    expect(
      readHesabPaySettings(config({ ...keyless, HESABPAY_WEBHOOK_SECRET: SECRET, HESABPAY_MOCK_AUTO_SUCCESS: 'true' })),
    ).toMatchObject({ mode: 'mock', mockAutoSuccess: true });
    expect(() => readHesabPaySettings(config({ ...base, HESABPAY_MOCK_AUTO_SUCCESS: 'yes' }))).toThrow(/true.*false/);
  });

  it('prices the four plans from one monthly list price, 1000 unless set', () => {
    const s = readHesabPaySettings(config(LIVE_ENV));
    expect(s.prices.subscriptionListMonthly).toBe('1000');
    // 1000 a month less 10%; 3000 less 20%; 6000 less 35%; 12000 less 50%.
    expect(s.prices.subscription).toEqual({ MONTHLY: '900', QUARTERLY: '2400', SEMIANNUAL: '3900', YEARLY: '6000' });
    const listed = readHesabPaySettings(config({ ...LIVE_ENV, HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY: '1200' }));
    expect(listed.prices.subscriptionListMonthly).toBe('1200');
    expect(listed.prices.subscription).toEqual({ MONTHLY: '1080', QUARTERLY: '2880', SEMIANNUAL: '4680', YEARLY: '7200' });
  });

  it('ignores the old per-plan price settings, so a stale one cannot contradict the advertised discount', () => {
    const s = readHesabPaySettings(
      config({
        ...LIVE_ENV,
        HESABPAY_PRICE_SUBSCRIPTION_MONTHLY: '1000',
        HESABPAY_PRICE_SUBSCRIPTION_QUARTERLY: '2700',
        HESABPAY_PRICE_SUBSCRIPTION_YEARLY: '9600',
      }),
    );
    expect(s.prices.subscription).toEqual({ MONTHLY: '900', QUARTERLY: '2400', SEMIANNUAL: '3900', YEARLY: '6000' });
  });

  it('does not need any plan price in live mode', () => {
    expect(() => readHesabPaySettings(config(LIVE_ENV))).not.toThrow();
  });

  it('allows mock mode in production when chosen on purpose', () => {
    const s = readHesabPaySettings(config({ NODE_ENV: 'production', HESABPAY_MODE: 'mock', HESABPAY_WEBHOOK_SECRET: SECRET }));
    expect(s).toMatchObject({ mode: 'mock', webhookSecret: SECRET });
  });

  it('falls back to mock mode when live mode (chosen, or the production default) has no API key', () => {
    for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', HESABPAY_MODE: 'live', HESABPAY_API_KEY: ' ' }]) {
      const s = readHesabPaySettings(config(env));
      expect(s.mode).toBe('mock');
      expect(s.prices.ladder).toBe('50');
      // No secret was given, so a random one closes the webhook rather than a guessable one opening it.
      expect(s.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(readHesabPaySettings(config({ NODE_ENV: 'production', HESABPAY_WEBHOOK_SECRET: SECRET })).webhookSecret).toBe(SECRET);
  });

  it('still insists on explicit prices once an API key is given', () => {
    expect(() => readHesabPaySettings(config({ NODE_ENV: 'production', HESABPAY_API_KEY: 'key' }))).toThrow(/must be set/);
  });

  it('requires a long webhook secret in mock mode', () => {
    expect(() => readHesabPaySettings(config({}))).toThrow(/at least 16/);
    expect(() => readHesabPaySettings(config({ HESABPAY_WEBHOOK_SECRET: 'short' }))).toThrow(/at least 16/);
  });

  it('accepts a fully specified live configuration and trims the base URL', () => {
    const s = readHesabPaySettings(config({ ...LIVE_ENV, HESABPAY_BASE_URL: 'https://example.test/v1///' }));
    expect(s).toMatchObject({ mode: 'live', apiKey: 'key', baseUrl: 'https://example.test/v1' });
  });

  it.each(Object.keys(LIVE_ENV).filter((k) => k !== 'HESABPAY_MODE' && k !== 'HESABPAY_API_KEY'))('refuses live mode without %s', (name) => {
    const env: Record<string, string> = { ...LIVE_ENV };
    delete env[name];
    expect(() => readHesabPaySettings(config(env))).toThrow(new RegExp(name));
  });

  it.each([
    ['HESABPAY_PRICE_LADDER', '10.999'],
    ['HESABPAY_PRICE_LADDER', '0'],
    ['HESABPAY_PRICE_LADDER', '-5'],
    ['HESABPAY_PRICE_LADDER', '1e3'],
    ['HESABPAY_PRICE_SUBSCRIPTION_LIST_MONTHLY', '0'],
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
