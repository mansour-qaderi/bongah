import { PermissionsAndroid, Platform } from 'react-native';
import {
  firebasePermission,
  firebaseRequestPermission,
  type IosPermission,
} from './firebase';

/** granted: pushes will show. undetermined: we may ask. denied: only the phone's settings can change it. */
export type PushPermission = IosPermission;

/** Android 13 (API 33) made notifications a runtime permission; before that, installing the app was consent. */
const ANDROID_ASKS_FROM = 33;
const POST_NOTIFICATIONS = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;

const asksAtRuntime = () =>
  Platform.OS === 'android' && Number(Platform.Version) >= ANDROID_ASKS_FROM;

/** Where the app stands right now. Never shows a prompt. */
export async function getPushPermission(): Promise<PushPermission> {
  if (asksAtRuntime()) {
    try {
      return (await PermissionsAndroid.check(POST_NOTIFICATIONS))
        ? 'granted'
        : 'undetermined';
    } catch {
      return 'denied';
    }
  }
  return firebasePermission();
}

/**
 * Asks the person, if the phone still allows asking, and returns the answer.
 *
 * Firebase's own requestPermission() does NOT prompt on Android (it reports "authorized" at once), so on
 * Android 13+ the system prompt has to come from PermissionsAndroid; without it a push would arrive at the phone
 * and be dropped silently. On iOS Firebase's prompt is used.
 */
export async function requestPushPermission(): Promise<PushPermission> {
  if (asksAtRuntime()) {
    try {
      const answer = await PermissionsAndroid.request(POST_NOTIFICATIONS);
      return answer === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  if (Platform.OS === 'android') return firebasePermission();
  return firebaseRequestPermission();
}
