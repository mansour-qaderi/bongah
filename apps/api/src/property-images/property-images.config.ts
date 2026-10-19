import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROPERTY_IMAGE_SETTINGS = Symbol('PROPERTY_IMAGE_SETTINGS');

export interface PropertyImageSettings {
  /** Largest listing photo a regular account may upload (PROPERTY_IMAGE_MAX_BYTES). */
  maxBytes: number;
  /** Largest photo an account with the agency perks may upload: the "high-resolution photos" perk (PROPERTY_IMAGE_MAX_BYTES_ADVANCED). */
  maxBytesAdvanced: number;
  /** Pictures a regular account may keep (PROPERTY_IMAGE_MAX_PER_ACCOUNT). */
  maxPerAccount: number;
  /** Pictures an account with the agency perks may keep (PROPERTY_IMAGE_MAX_PER_ACCOUNT_ADVANCED). */
  maxPerAccountAdvanced: number;
  /** Where the local-disk store writes (UPLOAD_DIR, shared with chat pictures). */
  uploadDir: string;
  /** The address the API is reached at from outside, no trailing slash (PUBLIC_API_URL). Photo URLs are built from it. */
  publicBaseUrl: string;
}

const DEFAULTS = {
  maxBytes: 3_000_000,
  maxBytesAdvanced: 15_000_000,
  maxPerAccount: 100,
  maxPerAccountAdvanced: 5000,
};

function positiveInt(config: ConfigService, name: string, fallback: number, max: number): number {
  const raw = config.get<string>(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new Error(`${name} must be a whole number between 1 and ${max}.`);
  }
  return value;
}

/** Reads and validates the listing-photo settings once, so a typo fails at startup rather than at the first upload. */
export function readPropertyImageSettings(config: ConfigService): PropertyImageSettings {
  const maxBytes = positiveInt(config, 'PROPERTY_IMAGE_MAX_BYTES', DEFAULTS.maxBytes, 50_000_000);
  const maxBytesAdvanced = positiveInt(config, 'PROPERTY_IMAGE_MAX_BYTES_ADVANCED', DEFAULTS.maxBytesAdvanced, 50_000_000);
  if (maxBytesAdvanced < maxBytes) {
    throw new Error('PROPERTY_IMAGE_MAX_BYTES_ADVANCED must not be smaller than PROPERTY_IMAGE_MAX_BYTES.');
  }
  const maxPerAccount = positiveInt(config, 'PROPERTY_IMAGE_MAX_PER_ACCOUNT', DEFAULTS.maxPerAccount, 100_000);
  const maxPerAccountAdvanced = positiveInt(
    config,
    'PROPERTY_IMAGE_MAX_PER_ACCOUNT_ADVANCED',
    DEFAULTS.maxPerAccountAdvanced,
    1_000_000,
  );
  if (maxPerAccountAdvanced < maxPerAccount) {
    throw new Error('PROPERTY_IMAGE_MAX_PER_ACCOUNT_ADVANCED must not be smaller than PROPERTY_IMAGE_MAX_PER_ACCOUNT.');
  }

  const production = config.get<string>('NODE_ENV') === 'production';
  const uploadDir = config.get<string>('UPLOAD_DIR')?.trim();
  const configuredUrl = config.get<string>('PUBLIC_API_URL')?.trim();
  const logger = new Logger('PropertyImageConfig');
  if (production && !uploadDir) {
    logger.warn(
      `UPLOAD_DIR is not set: storing listing photos in ${join(tmpdir(), 'bongah-uploads')}. On most hosts (Render included) ` +
        'that disk is wiped on every deploy and restart, so uploaded photos will be lost. Mount a disk and set UPLOAD_DIR, or use object storage.',
    );
  }
  // Render sets RENDER_EXTERNAL_URL on web services, which is exactly the address the API is reached at.
  const fallbackUrl = (config.get<string>('RENDER_EXTERNAL_URL')?.trim() || `http://localhost:${config.get<string>('PORT') ?? '3000'}`).replace(/\/+$/, '');
  if (production && !configuredUrl) {
    logger.warn(
      `PUBLIC_API_URL is not set: building listing photo links from ${fallbackUrl}. Set PUBLIC_API_URL to the real public address ` +
        'before real users upload photos, because links already stored in listings keep the old address.',
    );
  }
  const publicBaseUrl = (configuredUrl || fallbackUrl).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(publicBaseUrl)) {
    throw new Error('PUBLIC_API_URL must be an http(s) address, e.g. https://api.bongah.example.');
  }

  return {
    maxBytes,
    maxBytesAdvanced,
    maxPerAccount,
    maxPerAccountAdvanced,
    uploadDir: uploadDir || join(tmpdir(), 'bongah-uploads'),
    publicBaseUrl,
  };
}
