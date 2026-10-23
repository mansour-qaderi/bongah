'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES, PROPERTY_TYPES } from '@bongah/shared-types';
import { MY_LISTING_SORTS, type MyListingSort } from '@bongah/validation';
import type { ListingQuery } from '@/hooks/use-listing-query';
import { CURRENCY_NAME, DEAL_LABEL, TYPE_LABEL } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';

const SORT_LABEL: Record<MyListingSort, string> = {
  newest: 'جدیدترین',
  oldest: 'قدیمی‌ترین',
  price_asc: 'قیمت: کم به زیاد',
  price_desc: 'قیمت: زیاد به کم',
  views: 'بیشترین بازدید',
};

export function ListingFilters({
  query,
  update,
  reset,
  activeFilters,
}: {
  query: ListingQuery;
  update: (patch: Partial<ListingQuery>) => void;
  reset: () => void;
  activeFilters: number;
}) {
  // The search box answers each keystroke at once but only asks the server once typing pauses.
  const [text, setText] = useState(query.q);
  const [minText, setMinText] = useState(query.min);
  const [maxText, setMaxText] = useState(query.max);
  // When the address changes from outside (reset, back button) the boxes follow it.
  useEffect(() => setText(query.q), [query.q]);
  useEffect(() => setMinText(query.min), [query.min]);
  useEffect(() => setMaxText(query.max), [query.max]);
  useEffect(() => {
    if (text === query.q && minText === query.min && maxText === query.max) return;
    const t = setTimeout(() => update({ q: text, min: minText, max: maxText }), 350);
    return () => clearTimeout(t);
  }, [text, minText, maxText, query.q, query.min, query.max, update]);

  const priceUsed = Boolean(minText || maxText) || query.sort === 'price_asc' || query.sort === 'price_desc';

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="جستجو در عنوان، آدرس، ناحیه، ولایت…"
            aria-label="جستجو در آگهی‌ها"
            className="ps-9"
            maxLength={100}
          />
        </div>
        <Select aria-label="ترتیب" value={query.sort} onChange={(e) => update({ sort: e.target.value as MyListingSort })} className="w-44">
          {MY_LISTING_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select aria-label="نوع ملک" value={query.type} onChange={(e) => update({ type: e.target.value as ListingQuery['type'] })} className="w-40">
          <option value="">همه انواع ملک</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select aria-label="نوع معامله" value={query.deal} onChange={(e) => update({ deal: e.target.value as ListingQuery['deal'] })} className="w-36">
          <option value="">همه معامله‌ها</option>
          {DEAL_TYPES.map((d) => (
            <option key={d} value={d}>
              {DEAL_LABEL[d]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2" role="group" aria-label="بازه قیمت">
          <Input
            inputMode="numeric"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            placeholder="قیمت از"
            aria-label="کمترین قیمت"
            className="w-28"
          />
          <span className="text-muted">تا</span>
          <Input
            inputMode="numeric"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            placeholder="قیمت تا"
            aria-label="بیشترین قیمت"
            className="w-28"
          />
          <Select
            aria-label="ارز"
            value={query.currency || (priceUsed ? 'AFGHANI' : '')}
            onChange={(e) => update({ currency: e.target.value as ListingQuery['currency'] })}
            className="w-32"
          >
            {priceUsed ? null : <option value="">همه ارزها</option>}
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_NAME[c]}
              </option>
            ))}
          </Select>
        </div>
        {activeFilters > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted">
            <X aria-hidden className="h-3.5 w-3.5" />
            پاک کردن فیلترها
          </Button>
        ) : null}
      </div>
    </div>
  );
}
