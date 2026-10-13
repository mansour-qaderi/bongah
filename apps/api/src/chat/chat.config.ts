import { ConfigService } from '@nestjs/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHAT_SETTINGS = Symbol('CHAT_SETTINGS');

export interface ChatSettings {
  /** Largest picture a regular account may send (CHAT_IMAGE_MAX_BYTES). A phone photo is downscaled to fit by the app. */
  imageMaxBytes: number;
  /** Largest picture an account with the agency perks may send: the "high-quality photos" perk (CHAT_IMAGE_MAX_BYTES_ADVANCED). */
  imageMaxBytesAdvanced: number;
  /** Messages one account may send per minute, over REST and sockets together (CHAT_MESSAGES_PER_MINUTE). */
  messagesPerMinute: number;
  /** Where the local-disk picture store writes (UPLOAD_DIR). Production needs object storage instead, see ChatImageStorage. */
  uploadDir: string;
}

export const DEFAULT_IMAGE_MAX_BYTES = 1_500_000;
export const DEFAULT_IMAGE_MAX_BYTES_ADVANCED = 8_000_000;
export const DEFAULT_MESSAGES_PER_MINUTE = 30;

function positiveInt(config: ConfigService, name: string, fallback: number, max: number): number {
  const raw = config.get<string>(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new Error(`${name} must be a whole number between 1 and ${max}.`);
  }
  return value;
}

/** Reads and validates the chat settings once, so a typo fails at startup rather than at the first upload. */
export function readChatSettings(config: ConfigService): ChatSettings {
  const imageMaxBytes = positiveInt(config, 'CHAT_IMAGE_MAX_BYTES', DEFAULT_IMAGE_MAX_BYTES, 50_000_000);
  const imageMaxBytesAdvanced = positiveInt(
    config,
    'CHAT_IMAGE_MAX_BYTES_ADVANCED',
    DEFAULT_IMAGE_MAX_BYTES_ADVANCED,
    50_000_000,
  );
  if (imageMaxBytesAdvanced < imageMaxBytes) {
    throw new Error('CHAT_IMAGE_MAX_BYTES_ADVANCED must not be smaller than CHAT_IMAGE_MAX_BYTES.');
  }

  const production = config.get<string>('NODE_ENV') === 'production';
  const configuredDir = config.get<string>('UPLOAD_DIR')?.trim();
  if (!configuredDir && production) {
    throw new Error(
      'UPLOAD_DIR must be set in production (and the local-disk picture store replaced by object storage before running more than one server).',
    );
  }

  return {
    imageMaxBytes,
    imageMaxBytesAdvanced,
    messagesPerMinute: positiveInt(config, 'CHAT_MESSAGES_PER_MINUTE', DEFAULT_MESSAGES_PER_MINUTE, 600),
    uploadDir: configuredDir || join(tmpdir(), 'bongah-uploads'),
  };
}
