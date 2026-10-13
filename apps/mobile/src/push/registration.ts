import { Platform } from 'react-native';
import type { Language } from '@bongah/shared-types';
import { registerPushDevice, removePushDevice } from '../api/endpoints';
import { fetchPushToken } from './firebase';
import { getPushPermission, requestPushPermission } from './permission';

export type SyncOutcome =
  /** The server knows this phone. */
  | 'registered'
  /** Notifications are off for the app on this phone. Nothing was sent to the server. */
  | 'no-permission'
  /** Firebase gave no token, or the server could not be reached. Worth trying again later. */
  | 'failed';

/** What the server was last told, so an unchanged phone is not announced again on every launch. */
let last: { token: string; language: Language; at: number } | null = null;
let inFlight: Promise<SyncOutcome> | null = null;

/** Registering again sooner than this, for the same token and language, would change nothing. */
const RECHECK_MS = 12 * 60 * 60 * 1000;
const SIGN_OUT_WAIT_MS = 3000;

/**
 * Makes sure the server can push to this phone: gets the Firebase token and tells the server. Without asking the
 * person anything unless `ask` is set (use that from a tap, never at startup). Never throws.
 */
export async function syncPushDevice(
  language: Language,
  options: { ask?: boolean; force?: boolean } = {},
): Promise<SyncOutcome> {
  // Two quiet triggers at once (start-up and a token refresh, say) share one run. A tap that asks, or forces, never
  // shares: it waits its turn and then does its own, so it cannot be answered by a run that did not prompt.
  if (inFlight && !options.ask && !options.force) return inFlight;
  if (inFlight) await inFlight;
  const current: Promise<SyncOutcome> = run(language, options).finally(() => {
    if (inFlight === current) inFlight = null;
  });
  inFlight = current;
  return current;
}

/** Resolves with `fallback` if `promise` has not settled after `ms`; the timer never outlives the promise. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>(resolve => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run(
  language: Language,
  { ask = false, force = false }: { ask?: boolean; force?: boolean },
): Promise<SyncOutcome> {
  try {
    let permission = await getPushPermission();
    if (permission !== 'granted' && ask) permission = await requestPushPermission();
    if (permission !== 'granted') return 'no-permission';

    const token = await fetchPushToken();
    if (!token) return 'failed';
    if (
      !force &&
      last &&
      last.token === token &&
      last.language === language &&
      Date.now() - last.at < RECHECK_MS
    ) {
      return 'registered';
    }
    await registerPushDevice({
      token,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      language,
    });
    last = { token, language, at: Date.now() };
    return 'registered';
  } catch {
    return 'failed';
  }
}

/** The first-time ask from a tap: shows the system prompt if the phone still allows it, then registers. */
export const enablePush = (language: Language) =>
  syncPushDevice(language, { ask: true, force: true });

/**
 * Sign-out: stop this phone receiving the account's pushes. Best effort and quick: signing out must not wait on
 * a bad network. If it fails, the next account that signs in on this phone takes the token over server-side.
 */
export async function forgetPushDevice(): Promise<void> {
  const known = last?.token;
  last = null;
  try {
    const token = known ?? (await within(fetchPushToken(), SIGN_OUT_WAIT_MS, null));
    if (!token) return;
    await within(removePushDevice(token), SIGN_OUT_WAIT_MS, undefined);
  } catch {
    // Offline or already signed out on the server: nothing more to do.
  }
}

/** Test seam: forget what the module remembers between tests. */
export function resetPushRegistration(): void {
  last = null;
  inFlight = null;
}
