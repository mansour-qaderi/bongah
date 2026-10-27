'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { Currency, DealType, PropertyType } from '@bongah/shared-types';
import { CURRENCIES, DEAL_TYPES, PROPERTY_TYPES } from '@bongah/shared-types';
import { MY_LISTING_SORTS, type MyListingSort } from '@bongah/validation';
import { parseLooseNumber } from '@/lib/format';

export type StatusTab = 'ACTIVE' | 'SOLD' | 'ARCHIVED' | 'ALL';
/** In the order the tabs are shown: everything first (the default), then by status. */
export const STATUS_TABS: readonly StatusTab[] = ['ALL', 'ACTIVE', 'SOLD', 'ARCHIVED'];
export const DEFAULT_TAB: StatusTab = 'ALL';
export const PAGE_SIZE = 20;

export interface ListingQuery {
  q: string;
  tab: StatusTab;
  type: PropertyType | '';
  deal: DealType | '';
  currency: Currency | '';
  min: string;
  max: string;
  sort: MyListingSort;
  page: number;
}

const DEFAULTS: ListingQuery = { q: '', tab: DEFAULT_TAB, type: '', deal: '', currency: '', min: '', max: '', sort: 'newest', page: 1 };

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** The list's filters live in the address bar, so a refresh, a back button and a shared link all keep them. */
export function useListingQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params.toString();

  const query = useMemo<ListingQuery>(() => {
    const p = new URLSearchParams(search);
    return {
      q: (p.get('q') ?? '').slice(0, 100),
      tab: oneOf(p.get('tab'), STATUS_TABS) ?? DEFAULTS.tab,
      type: oneOf(p.get('type'), PROPERTY_TYPES) ?? '',
      deal: oneOf(p.get('deal'), DEAL_TYPES) ?? '',
      currency: oneOf(p.get('currency'), CURRENCIES) ?? '',
      min: p.get('min') ?? '',
      max: p.get('max') ?? '',
      sort: oneOf(p.get('sort'), MY_LISTING_SORTS) ?? DEFAULTS.sort,
      page: Math.max(1, Number(p.get('page')) || 1),
    };
  }, [search]);

  const update = useCallback(
    (patch: Partial<ListingQuery>) => {
      const next = { ...query, ...patch };
      if (!('page' in patch)) next.page = 1; // any change of filter starts from the first page
      const out = new URLSearchParams();
      (Object.keys(next) as (keyof ListingQuery)[]).forEach((key) => {
        const value = next[key];
        if (value !== DEFAULTS[key] && value !== '') out.set(key, String(value));
      });
      const qs = out.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, router, pathname],
  );

  const reset = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);

  /** The same filters as the API's query string (the page and page size are added by the caller). */
  const apiQuery = useMemo(() => toApiQuery(query), [query]);
  const activeFilters =
    (query.q ? 1 : 0) + (query.type ? 1 : 0) + (query.deal ? 1 : 0) + (query.min || query.max ? 1 : 0) + (query.currency ? 1 : 0);

  return { query, update, reset, apiQuery, activeFilters };
}

export function toApiQuery(q: ListingQuery): Record<string, string | number | undefined> {
  const min = q.min ? parseLooseNumber(q.min) : null;
  const max = q.max ? parseLooseNumber(q.max) : null;
  const hasPrice = min !== null || max !== null;
  const priceSort = q.sort === 'price_asc' || q.sort === 'price_desc';
  // The API refuses a price filter or price order without a currency (comparing afghanis with dollars means nothing).
  const currency = q.currency || (hasPrice || priceSort ? 'AFGHANI' : undefined);
  const swap = min !== null && max !== null && min > max;
  return {
    q: q.q.trim() || undefined,
    status: q.tab === 'ALL' ? undefined : q.tab,
    type: q.type || undefined,
    deal_type: q.deal || undefined,
    currency,
    min_price: (swap ? max : min) ?? undefined,
    max_price: (swap ? min : max) ?? undefined,
    sort: q.sort,
  };
}
