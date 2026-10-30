import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/**
 * Small key-value store for preferences (language and the like). Secrets do NOT go here —
 * the sign-in token lives in the keychain (see auth/sessionStorage.ts).
 *
 * AsyncStorage v3 replaced the old default export with named databases; this wrapper keeps that
 * detail in one place. A storage failure must never crash the app, so reads fall back to
 * null and writes are best-effort.
 */
const storage = createAsyncStorage('bongah');

export const kv = {
  async get(key: string): Promise<string | null> {
    try {
      return await storage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await storage.setItem(key, value);
    } catch {
      // Best effort: the preference just won't survive a restart.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await storage.removeItem(key);
    } catch {
      // Best effort.
    }
  },
};

export const KV_KEYS = {
  language: 'language',
  /** The country the person works in, 'AF' or 'IR' (see market/marketStore.ts). Followed by the account's own setting once signed in. */
  market: 'market',
  /** Left over from versions that let the person pick a country in Settings; the store removes it on load (market/marketStore.ts). */
  marketManual: 'market_manual',
  /** '1' once the location prompt was shown for finding the country, so it is asked for once, not at every start. */
  marketAsked: 'market_asked',
  /** The ids of the listings this person has bookmarked, as a JSON array (see favorites/store.ts). */
  favorites: 'favorites',
  /** Which base map the person looks at, 'street' or 'satellite' (see map/mapStyleStore.ts). */
  mapStyle: 'map_style',
  /** The ids of the listings this person deleted from My Listings, as a JSON array (see listings/deleted.ts). */
  deletedListings: 'deleted_listings',
  /**
   * "This person has been shown the welcome card on this phone." A backup for the server's flag: if saving the
   * flag fails (offline), the card still does not come back on every launch.
   */
  welcomeSeen: (userId: string) => `welcome_seen:${userId}`,
} as const;
