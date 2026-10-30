'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_MARKET, type Market } from '@bongah/shared-types';
import { activeMarket, marketSettled, subscribeMarket } from '@/lib/market';

/** False until the country has been looked for (position, saved choice or the Iran fallback): a page that offers country-specific choices waits for it. */
export function useMarketSettled(): boolean {
  return useSyncExternalStore(subscribeMarket, marketSettled, () => false);
}

/** Just the market, for components that only need to word things for it (labels, option lists): no account request of their own. */
export function useActiveMarket(): Market {
  return useSyncExternalStore(subscribeMarket, activeMarket, () => DEFAULT_MARKET);
}
