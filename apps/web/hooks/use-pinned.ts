'use client';

import { useLocalStorage } from './use-local-storage';
import type { DealType, Currency, Market } from '@bongah/shared-types';
import { useActiveMarket } from './use-active-market';
import { currenciesFor, dealsFor, startCurrency } from '@/lib/market';
import { marketOfProvince } from '@/lib/provinces';
import type { PinnedDefaults } from '@/lib/import/types';

export interface Pinned extends Omit<PinnedDefaults, 'market'> {
  /** The market the listings being entered are for; '' follows the account's own market. */
  market: Market | '';
  /** Whether the person picked the usual currency themselves (otherwise a market's own starting currency applies). */
  currencyChosen: boolean;
  /** Keep these values after «ذخیره و ثبت بعدی» (on), or clear them with the rest of the form (off). */
  locked: boolean;
  /** The office's own pin, offered as the starting point for a listing's map position. */
  office_lat: string;
  office_lng: string;
}

export const DEFAULT_PINNED: Pinned = {
  market: '',
  locked: true,
  province: '',
  district: '',
  deal_type: 'SALE' satisfies DealType,
  currency: 'USD' satisfies Currency,
  currencyChosen: false,
  office_lat: '',
  office_lng: '',
};

/** What the agent keeps fixed while entering many listings. Saved in this browser. */
export function usePinned() {
  const [pinned, set] = useLocalStorage<Pinned>('bongah.pinned.v1', DEFAULT_PINNED);
  const merged = { ...DEFAULT_PINNED, ...pinned };
  return [merged, (patch: Partial<Pinned>) => set({ ...merged, ...patch })] as const;
}

/**
 * The market the listings being entered are for: the country the person is in (found from the browser's position, or
 * chosen in the account menu). The forms no longer have a country picker, so a country remembered from the days they did
 * is ignored.
 */
export function useBatchMarket() {
  const [, setPinned] = usePinned();
  const market: Market = useActiveMarket();
  return [market, (next: Market) => setPinned({ market: next })] as const;
}

/**
 * The pinned values as they apply to a market: a usual deal, currency or province that belongs to the other country is
 * left out (the currency then starts at the market's own, unless the person chose one that fits), so a form or an import
 * for Iran never starts with an Afghan province or an afghani price.
 */
export function pinnedFor(pinned: Pinned, market: Market): PinnedDefaults {
  const currencyFits = pinned.currency !== '' && currenciesFor(market).includes(pinned.currency);
  // An untouched default ("dollars") is Afghanistan's habit; Iran starts in tomans unless the person chose otherwise.
  const keepCurrency = currencyFits && (pinned.currencyChosen || market === 'AF');
  const owner = pinned.province ? marketOfProvince(pinned.province) : null;
  const provinceFits = !owner || owner === market;
  return {
    market,
    province: provinceFits ? pinned.province : '',
    district: provinceFits ? pinned.district : '',
    deal_type: pinned.deal_type !== '' && dealsFor(market).includes(pinned.deal_type) ? pinned.deal_type : '',
    currency: pinned.currency === '' ? '' : keepCurrency ? pinned.currency : startCurrency(market),
  };
}
