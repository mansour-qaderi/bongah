import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { readNotificationSettings } from './notification.config.js';

const read = (env: Record<string, string>) => readNotificationSettings(new ConfigService(env));

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'service_account', project_id: 'bongah-app', client_email: 'push@bongah-app.iam.gserviceaccount.com', private_key: privateKey, ...extra });

describe('readNotificationSettings', () => {
  it('uses the mock provider and an enabled scheduler outside production', () => {
    expect(read({})).toEqual({ provider: 'mock', fcm: null, schedulerEnabled: true });
    expect(read({ PUSH_PROVIDER: ' ', SCHEDULER_ENABLED: '' }).provider).toBe('mock');
  });

  it('refuses the mock provider in production, and defaults production to FCM (which then needs credentials)', () => {
    expect(() => read({ NODE_ENV: 'production', PUSH_PROVIDER: 'mock' })).toThrow(/not allowed in production/);
    expect(() => read({ NODE_ENV: 'production' })).toThrow(/FCM_SERVICE_ACCOUNT_JSON must be set/);
  });

  it('lets production switch pushes off explicitly, without credentials', () => {
    expect(read({ NODE_ENV: 'production', PUSH_PROVIDER: 'off' })).toMatchObject({ provider: 'off', fcm: null });
  });

  it('reads service-account credentials from JSON or from base64 of it', () => {
    const expected = { projectId: 'bongah-app', clientEmail: 'push@bongah-app.iam.gserviceaccount.com', privateKey };
    expect(read({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: account() }).fcm).toEqual(expected);
    expect(read({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: Buffer.from(account()).toString('base64') }).fcm).toEqual(expected);
  });

  it('accepts a key whose newlines were flattened to backslash-n by a hosting dashboard', () => {
    const flattened = account({ private_key: privateKey.replace(/\n/g, '\\n') }).replace(/\\\\n/g, '\\n');
    expect(read({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: flattened }).fcm?.privateKey).toBe(privateKey);
  });

  it.each([
    ['not json at all', 'hello world', /neither valid JSON nor base64/],
    ['no project', account({ project_id: undefined }), /no "project_id"/],
    ['no email', account({ client_email: '' }), /no "client_email"/],
    ['no key', account({ private_key: undefined }), /no "private_key"/],
    ['a key that is not a key', account({ private_key: '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n' }), /not a valid PEM key/],
  ])('refuses credentials with %s at startup', (_name, json, message) => {
    expect(() => read({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: json })).toThrow(message);
  });

  it('refuses an unknown provider and a vague scheduler switch', () => {
    expect(() => read({ PUSH_PROVIDER: 'onesignal' })).toThrow(/PUSH_PROVIDER/);
    expect(() => read({ SCHEDULER_ENABLED: 'maybe' })).toThrow(/SCHEDULER_ENABLED/);
    expect(read({ SCHEDULER_ENABLED: 'FALSE' }).schedulerEnabled).toBe(false);
    expect(read({ SCHEDULER_ENABLED: 'true' }).schedulerEnabled).toBe(true);
  });

  it('never puts the private key in an error message', () => {
    try {
      read({ PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT_JSON: account({ client_email: '' }) });
    } catch (error) {
      expect((error as Error).message).not.toContain('BEGIN');
      return;
    }
    throw new Error('expected a throw');
  });
});
