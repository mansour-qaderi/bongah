import { marketOfPoint, type Market } from '@bongah/shared-types';
import { locate } from '../map/location';
import { KV_KEYS, kv } from '../storage/kv';

/**
 * The country the phone is in, from its position, or null when that cannot be told (location refused or switched off, no
 * fix in time, or a position that is in neither country). The caller then falls back to Iran.
 *
 * The first time it may show the system's location prompt (the country is worked out without anyone choosing it, so the
 * phone has to be asked once); after that it only uses a permission that was already given, so an app that was refused
 * never asks again at every start. Never throws.
 */
export async function detectMarket(): Promise<Market | null> {
  try {
    const asked = (await kv.get(KV_KEYS.marketAsked)) === '1';
    if (!asked) await kv.set(KV_KEYS.marketAsked, '1');
    const found = await locate({ ask: !asked });
    return found.status === 'ok'
      ? marketOfPoint(found.coordinate.latitude, found.coordinate.longitude)
      : null;
  } catch {
    return null;
  }
}
