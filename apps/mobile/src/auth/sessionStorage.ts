import * as Keychain from 'react-native-keychain';
import type { User } from '@bongah/shared-types';

const SERVICE = 'af.bongah.session';

export interface Session {
  token: string;
  /** Epoch milliseconds when the token stops working. */
  expiresAt: number;
  user: User;
}

/**
 * The sign-in token is a credential, so it lives in the platform keychain (Android Keystore /
 * iOS Keychain), not in AsyncStorage. Any failure reads as "signed out" rather than crashing.
 */
export async function loadSession(): Promise<Session | null> {
  try {
    const stored = await Keychain.getGenericPassword({ service: SERVICE });
    if (!stored) return null;
    const parsed = JSON.parse(stored.password) as Partial<Session>;
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      !parsed.user ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  try {
    await Keychain.setGenericPassword('session', JSON.stringify(session), {
      service: SERVICE,
    });
  } catch {
    // Not fatal: the user stays signed in for this run, and signs in again next launch.
  }
}

export async function clearSession(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // Nothing more to do.
  }
}
