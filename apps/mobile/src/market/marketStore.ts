import { useSyncExternalStore } from 'react';
import {
  DEFAULT_MARKET,
  FALLBACK_MARKET,
  isMarket,
  type Market,
} from '@bongah/shared-types';
import { KV_KEYS, kv } from '../storage/kv';

/**
 * The country the person works in: Afghanistan or Iran. It decides the listings the feed shows, the currencies, deal
 * and property kinds the form offers, the map's starting view, the language offered and how the platform's fees are paid.
 *
 * One small shared store, like the base-map choice: every screen follows the same market at once and it is still there
 * after a restart. Nobody chooses it: there is no setting for it. Where it comes from, in order:
 *  1. the country the phone is in (market/detect.ts), remembered for the next start;
 *  2. otherwise the last country found;
 *  3. otherwise Iran: when location is off or gives nothing on a first start, the app opens in Iran.
 * Signed in, the account follows the same market (see useMarket.ts, which keeps the two together).
 */
let current: Market = FALLBACK_MARKET;
let loading: Promise<void> | null = null;
/** True once a saved value was read (or the market was set): the detection then only changes it when it learns more. */
let known = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

/** Reads what was saved once; later calls share the first read. */
export function loadMarket(): Promise<void> {
  loading ??= kv.get(KV_KEYS.market).then(raw => {
    // Older versions let the person pick a country in Settings and kept it for good. That setting is gone and the country
    // is found from the phone again, so the leftover "chosen by hand" mark is dropped: it would pin the app to a country
    // with no way left to change it.
    kv.remove(KV_KEYS.marketManual).catch(() => undefined);
    // Something already set the market while the read was out: that is newer than what was saved.
    if (known) return;
    if (isMarket(raw)) {
      known = true;
      if (raw !== current) {
        current = raw;
        emit();
      }
    }
  });
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  loadMarket();
  return () => listeners.delete(listener);
}

const snapshot = () => current;

/** The market in use right now (for code that is not a component). */
export const getMarket = (): Market => current;

/** Whether a country was saved or set before (a first start has none: the detection then falls back to Iran). */
export const isMarketKnown = (): boolean => known;

/** Sets the market (what the phone's position, or the account, says) and remembers it on the phone. */
export async function setMarket(market: Market): Promise<void> {
  known = true;
  if (market !== current) {
    current = market;
    emit();
  }
  await kv.set(KV_KEYS.market, market);
}

/** For tests: forget everything held in memory so the next read starts from the store again. */
export function resetMarketForTests(market: Market = DEFAULT_MARKET): void {
  current = market;
  loading = null;
  known = false;
  emit();
}

/** The market in use. Re-renders when it changes. */
export function useActiveMarket(): Market {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
