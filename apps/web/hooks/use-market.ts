'use client';

import { useEffect, useMemo } from 'react';
import { MARKET_CONFIG, type Market, type MarketConfig, type User } from '@bongah/shared-types';
import { api } from '@/lib/api';
import { activeMarket, restoreMarket } from '@/lib/market';
import { useLanguage } from '@/i18n/provider';
import { labelsFor } from '@/lib/labels';
import { useMe } from './use-api';
import { useActiveMarket, useMarketSettled } from './use-active-market';

export { useActiveMarket, useMarketSettled };

/**
 * Put once in the signed-in frame. The country is the one the browser is in (see settleMarket, run from the root layout),
 * and the account follows it, so the phone app and another browser agree. Nobody picks a country: there is no setting.
 */
export function useMarketSync(): void {
  const { data: me, mutate } = useMe();
  const settled = useMarketSettled();
  useEffect(() => restoreMarket(), []);
  const account = me?.market;
  useEffect(() => {
    if (!account || !settled) return;
    if (account !== activeMarket()) {
      // Saved quietly: if the server says no, the page still shows the right country and tries again next visit.
      api
        .patch<User>('users/me/preferences', { market: activeMarket() })
        .then((updated) => mutate(updated, { revalidate: false }))
        .catch(() => undefined);
    }
  }, [account, settled, mutate]);
}

export interface MarketState {
  market: Market;
  config: MarketConfig;
}

/** The market in use (found from the browser, never chosen) and what it offers. */
export function useMarket(): MarketState {
  const market = useActiveMarket();
  return { market, config: MARKET_CONFIG[market] };
}

/** The market a draft is for: its own, else the account's (and it follows the account while it has none). */
export function useRowMarket(row: { market?: Market }): Market {
  const account = useActiveMarket();
  return row.market ?? account;
}

/** The names (deal wording especially) of one market, in the language shown. */
export function useLabelsFor(market: Market) {
  const { language } = useLanguage();
  return useMemo(() => labelsFor(language, market), [language, market]);
}
