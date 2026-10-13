/**
 * The only file that touches Firebase Cloud Messaging. Everything else asks this one, so the rest of the app
 * (and its tests) never depend on a native module being linked, and a phone where Firebase is not set up
 * (no google-services.json yet, no Play Services) just behaves as "pushes unavailable" instead of crashing.
 *
 * The library is loaded on first use, inside try/catch, for the same reason. (A plain require, not import(): Jest
 * cannot run a dynamic import, and the app gains nothing from deferring a module that is needed at start-up anyway.)
 */
type MessagingModule = typeof import('@react-native-firebase/messaging');

let loaded: { module: MessagingModule | null } | null = null;

function load(): MessagingModule | null {
  loaded ??= {
    module: (() => {
      try {
        return require('@react-native-firebase/messaging') as MessagingModule;
      } catch {
        return null;
      }
    })(),
  };
  return loaded.module;
}

/** The phone's FCM registration token, or null when Firebase is not available here. */
export async function fetchPushToken(): Promise<string | null> {
  try {
    const firebase = load();
    if (!firebase) return null;
    const token = await firebase.getToken(firebase.getMessaging());
    return token || null;
  } catch {
    return null;
  }
}

/** Calls `listener` whenever Firebase issues a new token (reinstall, restore, key rotation). Returns the unsubscribe. */
export function onPushTokenRefresh(listener: (token: string) => void): () => void {
  try {
    const firebase = load();
    if (!firebase) return () => undefined;
    return firebase.onTokenRefresh(firebase.getMessaging(), listener);
  } catch {
    return () => undefined;
  }
}

export type IosPermission = 'granted' | 'denied' | 'undetermined';

function fromStatus(
  firebase: MessagingModule,
  status: number,
): IosPermission {
  const { AuthorizationStatus } = firebase;
  if (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL ||
    status === AuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return status === AuthorizationStatus.NOT_DETERMINED ? 'undetermined' : 'denied';
}

/**
 * Whether notifications are allowed for the app, as Firebase reports it. On iOS this is the permission itself; on Android
 * before 13 it is "notifications are not switched off in system settings". (Android 13+ asks through
 * PermissionsAndroid instead: see permission.ts.)
 * These two Firebase calls are marked deprecated in 26.x, with "removed in a future major release": when that
 * happens, replace the bodies here with react-native-permissions or expo-notifications and nothing else changes.
 */
export async function firebasePermission(): Promise<IosPermission> {
  try {
    const firebase = load();
    if (!firebase) return 'denied';
    return fromStatus(firebase, await firebase.hasPermission(firebase.getMessaging()));
  } catch {
    return 'denied';
  }
}

/** Shows the iOS permission prompt (once; afterwards it just reports the earlier answer). */
export async function firebaseRequestPermission(): Promise<IosPermission> {
  try {
    const firebase = load();
    if (!firebase) return 'denied';
    return fromStatus(firebase, await firebase.requestPermission(firebase.getMessaging()));
  } catch {
    return 'denied';
  }
}
