import { ConfigService } from '@nestjs/config';
import { readPropertyImageSettings } from './property-images.config.js';

const read = (env: Record<string, string> = {}) => readPropertyImageSettings(new ConfigService(env));

describe('readPropertyImageSettings', () => {
  it('has sensible defaults for development', () => {
    const settings = read({ PORT: '4000' });
    expect(settings).toMatchObject({
      maxBytes: 3_000_000,
      maxBytesAdvanced: 15_000_000,
      maxPerAccount: 100,
      maxPerAccountAdvanced: 5000,
      publicBaseUrl: 'http://localhost:4000',
    });
    expect(settings.uploadDir).toContain('bongah-uploads');
  });

  it('takes the configured values and drops trailing slashes from the public address', () => {
    const settings = read({
      PROPERTY_IMAGE_MAX_BYTES: '1000000',
      PROPERTY_IMAGE_MAX_BYTES_ADVANCED: '2000000',
      PROPERTY_IMAGE_MAX_PER_ACCOUNT: '10',
      PROPERTY_IMAGE_MAX_PER_ACCOUNT_ADVANCED: '20',
      PUBLIC_API_URL: 'https://api.bongah.example//',
      UPLOAD_DIR: '/data/uploads',
    });
    expect(settings).toMatchObject({
      maxBytes: 1_000_000,
      maxBytesAdvanced: 2_000_000,
      maxPerAccount: 10,
      maxPerAccountAdvanced: 20,
      publicBaseUrl: 'https://api.bongah.example',
      uploadDir: '/data/uploads',
    });
  });

  it.each([
    ['a non-number', { PROPERTY_IMAGE_MAX_BYTES: 'big' }],
    ['a decimal', { PROPERTY_IMAGE_MAX_PER_ACCOUNT: '2.5' }],
    ['zero', { PROPERTY_IMAGE_MAX_BYTES: '0' }],
    ['a size over the ceiling', { PROPERTY_IMAGE_MAX_BYTES_ADVANCED: '999999999' }],
    ['an advanced size below the ordinary one', { PROPERTY_IMAGE_MAX_BYTES: '5000000', PROPERTY_IMAGE_MAX_BYTES_ADVANCED: '4000000' }],
    ['an advanced quota below the ordinary one', { PROPERTY_IMAGE_MAX_PER_ACCOUNT: '500', PROPERTY_IMAGE_MAX_PER_ACCOUNT_ADVANCED: '400' }],
    ['a public address that is not http(s)', { PUBLIC_API_URL: 'api.bongah.example' }],
  ])('fails at startup for %s', (_name, env) => {
    expect(() => read(env)).toThrow();
  });

  it('insists on a storage folder and a public address in production', () => {
    expect(() => read({ NODE_ENV: 'production', PUBLIC_API_URL: 'https://api.bongah.example' })).toThrow(/UPLOAD_DIR/);
    expect(() => read({ NODE_ENV: 'production', UPLOAD_DIR: '/data' })).toThrow(/PUBLIC_API_URL/);
    expect(read({ NODE_ENV: 'production', UPLOAD_DIR: '/data', PUBLIC_API_URL: 'https://api.bongah.example' }).publicBaseUrl).toBe(
      'https://api.bongah.example',
    );
  });
});
