import { createPrivateKey } from 'node:crypto';
import { Logger } from '@nestjs/common';
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
   * "mock" records pushes in memory and never contacts Google (in production it logs a warning; "fcm" without
   * FCM_SERVICE_ACCOUNT_JSON falls back to it, also with a warning).
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
  const requested = config.get<string>('PUSH_PROVIDER')?.trim() || (production ? 'fcm' : 'mock');
  if (requested !== 'mock' && requested !== 'fcm' && requested !== 'off') {
    throw new Error('PUSH_PROVIDER must be "mock", "fcm" or "off".');
  }
  let provider: NotificationSettings['provider'] = requested;
  let fcm: FcmCredentials | null = null;
  if (provider === 'fcm') {
    const raw = config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    if (raw?.trim()) {
      fcm = parseServiceAccount(raw);
    } else {
      // Staging/testing deployments (e.g. on Render) often have no Firebase project yet. Only a MISSING key
      // falls back; a key that is present but malformed still fails the startup in parseServiceAccount.
      new Logger('NotificationConfig').warn(
        'PUSH_PROVIDER=fcm but FCM_SERVICE_ACCOUNT_JSON is not set: falling back to the mock push provider. ' +
          'No push will reach any phone. Set the key to send real pushes.',
      );
      provider = 'mock';
    }
  }
  if (requested === 'mock' && production) {
    new Logger('NotificationConfig').warn('PUSH_PROVIDER=mock in production: no push will reach any phone. Use for testing only.');
  }

  const schedulerRaw = config.get<string>('SCHEDULER_ENABLED')?.trim().toLowerCase();
  if (schedulerRaw !== undefined && schedulerRaw !== '' && schedulerRaw !== 'true' && schedulerRaw !== 'false') {
    throw new Error('SCHEDULER_ENABLED must be "true" or "false".');
  }

  return {
    provider,
    fcm,
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
