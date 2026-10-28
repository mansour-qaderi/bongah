import { PermissionsAndroid, Platform } from 'react-native';
import { LocationManager } from './native';
import { within } from '../utils/within';
import { isInsideAfghanistan, type Coordinate } from './geo';

/**
 * Where the phone is, for the "you are here" dot and for centring the map.
 *
 * Uses the Mapbox SDK's own location module (no extra dependency; see map/native.tsx). Native setup: iOS needs
 * NSLocationWhenInUseUsageDescription in Info.plist; the Android permissions are declared by the SDK's manifest.
 */
export type LocateResult =
  | { status: 'ok'; coordinate: Coordinate }
  /** The person (or the phone's settings) refuses location for the app. */
  | { status: 'denied' }
  /** Permitted, but no position came back in time (GPS off, indoors, no signal). */
  | { status: 'unavailable' }
  /** A position came back, but it is not in Afghanistan, so the map should stay where it is. */
  | { status: 'outside' };

/** How long to wait for a fix before saying "unavailable". */
export const LOCATE_TIMEOUT_MS = 10_000;

/**
 * Whether location is already allowed, without ever showing a prompt. null = cannot be known without
 * asking (iOS has no silent check here), so the caller just tries and treats "no position" as "no".
 */
async function alreadyAllowed(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const [fine, coarse] = await Promise.all([
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ),
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ),
    ]);
    return fine || coarse;
  } catch {
    return false;
  }
}

/**
 * One position fix. `ask: false` is for startup: it never shows a permission prompt, so an app that was never
 * allowed simply stays where it is. `ask: true` is for the "my location" button and may prompt.
 * Never throws.
 */
export async function locate({ ask }: { ask: boolean }): Promise<LocateResult> {
  try {
    let allowed = await alreadyAllowed();
    if (allowed !== true && ask) {
      allowed = await LocationManager.requestPermissions();
    }
    if (allowed === false) return { status: 'denied' };

    const position = await within(
      LocationManager.getCurrentPosition(),
      LOCATE_TIMEOUT_MS,
      undefined,
    );
    if (!position) {
      // iOS, quiet: no position most likely means "never allowed", which is not worth a message.
      return { status: allowed === null && !ask ? 'denied' : 'unavailable' };
    }

    const { latitude, longitude } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { status: 'unavailable' };
    }
    const coordinate = { latitude, longitude };
    return isInsideAfghanistan(coordinate)
      ? { status: 'ok', coordinate }
      : { status: 'outside' };
  } catch {
    return { status: 'unavailable' };
  }
}
