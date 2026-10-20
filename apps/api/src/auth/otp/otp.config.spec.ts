import { ConfigService } from '@nestjs/config';
import { readOtpDevFallback, readOtpProvider, readWhatsAppSettings } from './otp.config.js';

const config = (env: Record<string, string>) => new ConfigService(env);
const WHATSAPP_ENV = {
  WHATSAPP_ACCESS_TOKEN: 'token-for-tests',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_TEMPLATE_NAME: 'bongah_verification_code',
};

describe('readOtpProvider', () => {
  it('defaults to mock, and says the choice was not written down', () => {
    expect(readOtpProvider(config({}))).toEqual({ provider: 'mock', explicit: false });
  });

  it('reads OTP_PROVIDER, and the old SMS_PROVIDER when it is the only one set', () => {
    expect(readOtpProvider(config({ OTP_PROVIDER: 'whatsapp' }))).toEqual({ provider: 'whatsapp', explicit: true });
    expect(readOtpProvider(config({ SMS_PROVIDER: 'mock' }))).toEqual({ provider: 'mock', explicit: true });
    expect(readOtpProvider(config({ OTP_PROVIDER: 'whatsapp', SMS_PROVIDER: 'mock' })).provider).toBe('whatsapp');
  });

  it('refuses a provider it does not know', () => {
    expect(() => readOtpProvider(config({ OTP_PROVIDER: 'carrier-pigeon' }))).toThrow(/Unsupported OTP_PROVIDER/);
  });
});

describe('readOtpDevFallback', () => {
  it('is on outside production and off in production when not written down', () => {
    expect(readOtpDevFallback(config({}))).toBe(true);
    expect(readOtpDevFallback(config({ NODE_ENV: 'development' }))).toBe(true);
    expect(readOtpDevFallback(config({ NODE_ENV: 'production' }))).toBe(false);
  });

  it('follows OTP_DEV_FALLBACK when it is set, in production too', () => {
    expect(readOtpDevFallback(config({ NODE_ENV: 'production', OTP_DEV_FALLBACK: 'true' }))).toBe(true);
    expect(readOtpDevFallback(config({ NODE_ENV: 'development', OTP_DEV_FALLBACK: '0' }))).toBe(false);
  });

  it('refuses a value it does not understand', () => {
    expect(() => readOtpDevFallback(config({ OTP_DEV_FALLBACK: 'maybe' }))).toThrow(/OTP_DEV_FALLBACK/);
  });
});

describe('readWhatsAppSettings', () => {
  it('fills in the defaults', () => {
    expect(readWhatsAppSettings(config(WHATSAPP_ENV))).toEqual({
      accessToken: 'token-for-tests',
      phoneNumberId: '123456789012345',
      templateName: 'bongah_verification_code',
      templateLanguage: 'fa',
      apiVersion: 'v21.0',
      baseUrl: 'https://graph.facebook.com',
      timeoutMs: 8000,
    });
  });

  it.each(Object.keys(WHATSAPP_ENV))('names %s when it is missing', (name) => {
    const env: Record<string, string> = { ...WHATSAPP_ENV };
    delete env[name];
    expect(() => readWhatsAppSettings(config(env))).toThrow(new RegExp(name));
  });

  it.each([
    ['WHATSAPP_PHONE_NUMBER_ID', '+93790049201'],
    ['WHATSAPP_API_VERSION', '21'],
    ['WHATSAPP_TIMEOUT_MS', '5'],
    ['WHATSAPP_TIMEOUT_MS', 'soon'],
    ['WHATSAPP_TEMPLATE_NAME', 'Has Spaces'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => readWhatsAppSettings(config({ ...WHATSAPP_ENV, [name]: value }))).toThrow(new RegExp(name));
  });

  it('trims the base URL and takes the overrides', () => {
    const s = readWhatsAppSettings(config({ ...WHATSAPP_ENV, WHATSAPP_API_BASE_URL: 'https://example.test///', WHATSAPP_TEMPLATE_LANGUAGE: 'ps', WHATSAPP_TIMEOUT_MS: '2500' }));
    expect(s).toMatchObject({ baseUrl: 'https://example.test', templateLanguage: 'ps', timeoutMs: 2500 });
  });
});
