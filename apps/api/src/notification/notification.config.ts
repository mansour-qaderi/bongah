import { createPrivateKey } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

export const NOTIFICATION_SETTINGS = Symbol('NOTIFICATION_SETTINGS');

/** The Kabul time zone name, for the scheduler. (Kabul has no daylight saving: always UTC+4:30.) */
export const KABUL_TIME_ZONE = 'Asia/Kabul';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  /** PEM, as found in a Firebase service-account key file. */
  privateKey: string;
}

export interface NotificationSettings {
  /**
   * "mock" records pushes in memory and never contacts Google (refused in production).
   * "fcm" sends through Firebase Cloud Messaging.
   * "off" keeps the endpoints but never sends: the morning run does nothing.
   */
  provider: 'mock' | 'fcm' | 'off';
  fcm: FcmCredentials | null;
  /** SCHEDULER_ENABLED=false stops the timer on this server (tests, or a second server that must not run it). */
  schedulerEnabled: boolean;
}

/** Reads and validates the push settings once, so a typo fails at startup rather than at 08:00. */
export function readNotificationSettings(config: ConfigService): NotificationSettings {
  const production = config.get<string>('NODE_ENV') === 'production';
  const provider = config.get<string>('PUSH_PROVIDER')?.trim() || (production ? 'fcm' : 'mock');
  if (provider !== 'mock' && provider !== 'fcm' && provider !== 'off') {
    throw new Error('PUSH_PROVIDER must be "mock", "fcm" or "off".');
  }
  if (provider === 'mock' && production) {
    throw new Error('PUSH_PROVIDER=mock is not allowed in production: no push would ever reach a phone. Use "fcm", or "off" to switch pushes off.');
  }

  const schedulerRaw = config.get<string>('SCHEDULER_ENABLED')?.trim().toLowerCase();
  if (schedulerRaw !== undefined && schedulerRaw !== '' && schedulerRaw !== 'true' && schedulerRaw !== 'false') {
    throw new Error('SCHEDULER_ENABLED must be "true" or "false".');
  }

  return {
    provider,
    fcm: provider === 'fcm' ? parseServiceAccount(config.get<string>('FCM_SERVICE_ACCOUNT_JSON')) : null,
    schedulerEnabled: schedulerRaw !== 'false',
  };
}

/**
 * FCM_SERVICE_ACCOUNT_JSON is the Firebase service-account key file, either as the JSON itself or base64 of it
 * (base64 survives hosting dashboards that mangle newlines and quotes).
 */
export function parseServiceAccount(raw: string | undefined): FcmCredentials {
  const value = raw?.trim();
  if (!value) throw new Error('FCM_SERVICE_ACCOUNT_JSON must be set when PUSH_PROVIDER=fcm.');

  let json: unknown;
  try {
    json = JSON.parse(value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64 of valid JSON.');
  }
  const field = (name: string): string => {
    const found = (json as Record<string, unknown> | null)?.[name];
    if (typeof found !== 'string' || found.trim() === '') {
      throw new Error(`FCM_SERVICE_ACCOUNT_JSON has no "${name}".`);
    }
    return found;
  };

  const privateKey = field('private_key').replace(/\\n/g, '\n');
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON has a "private_key" that is not a valid PEM key.');
  }
  return { projectId: field('project_id'), clientEmail: field('client_email'), privateKey };
}
