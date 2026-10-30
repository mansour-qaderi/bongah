'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { PropertyFeature } from '@bongah/shared-types';
import { MY_LISTING_SORTS, type MyListingSort } from '@bongah/validation';
import type { ListingQuery } from '@/hooks/use-listing-query';
import { useT } from '@/i18n/provider';
import { useMarketT } from '@/i18n/use-labels';
import { useActiveMarket } from '@/hooks/use-active-market';
import { currenciesFor, dealsFor, deedsFor, featuresFor, startCurrency, typesFor } from '@/lib/market';
import { useLabels } from '@/i18n/use-labels';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';


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
  const t = useT();
  const tm = useMarketT();
  const labels = useLabels();
  const market = useActiveMarket();
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
    const timer = setTimeout(() => update({ q: text, min: minText, max: maxText }), 350);
    return () => clearTimeout(timer);
  }, [text, minText, maxText, query.q, query.min, query.max, update]);

  // The choices of the market being worked in. A value in the address that belongs to the other one (an old link) stays
  // in its list so the box still shows what is filtering.
  const withCurrent = <T extends string>(list: readonly T[], current: T | ''): readonly T[] => (current && !list.includes(current as T) ? [...list, current as T] : list);
  const typeList = withCurrent(typesFor(market), query.type);
  const dealList = withCurrent(dealsFor(market), query.deal);
  const currencyList = withCurrent(currenciesFor(market), query.currency);
  const tags = featuresFor(market);
  const deeds = deedsFor(market);
  const toggleTag = (feature: PropertyFeature, on: boolean) =>
    update({ features: tags.filter((x) => (x === feature ? on : query.features.includes(x))) });

  const priceUsed = Boolean(minText || maxText) || query.sort === 'price_asc' || query.sort === 'price_desc';

  return (
    <div className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tm('filter.search')}
            aria-label={t('filter.searchAria')}
            className="ps-9"
            maxLength={100}
          />
        </div>
        <Select aria-label={t('filter.sort')} value={query.sort} onChange={(e) => update({ sort: e.target.value as MyListingSort })} className="w-44">
          {MY_LISTING_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`list.sort.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select aria-label={t('filter.type')} value={query.type} onChange={(e) => update({ type: e.target.value as ListingQuery['type'] })} className="w-40">
          <option value="">{t('filter.allTypes')}</option>
          {typeList.map((type) => (
            <option key={type} value={type}>
              {labels.type[type]}
            </option>
          ))}
        </Select>
        <Select aria-label={t('filter.deal')} value={query.deal} onChange={(e) => update({ deal: e.target.value as ListingQuery['deal'] })} className="w-36">
          <option value="">{t('filter.allDeals')}</option>
          {dealList.map((d) => (
            <option key={d} value={d}>
              {labels.deal[d]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2" role="group" aria-label={t('filter.priceRange')}>
          <Input
            inputMode="numeric"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            placeholder={t('filter.minPlaceholder')}
            aria-label={t('filter.minAria')}
            className="w-28"
          />
          <span className="text-muted">{t('filter.to')}</span>
          <Input
            inputMode="numeric"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            placeholder={t('filter.maxPlaceholder')}
            aria-label={t('filter.maxAria')}
            className="w-28"
          />
          <Select
            aria-label={t('filter.currency')}
            value={query.currency || (priceUsed ? startCurrency(market) : '')}
            onChange={(e) => update({ currency: e.target.value as ListingQuery['currency'] })}
            className="w-32"
          >
            {priceUsed ? null : <option value="">{t('filter.allCurrencies')}</option>}
            {currencyList.map((c) => (
              <option key={c} value={c}>
                {labels.currency[c]}
              </option>
            ))}
          </Select>
        </div>
        {deeds.length > 0 ? (
          <Select aria-label={t('filter.deed')} value={query.deed} onChange={(e) => update({ deed: e.target.value as ListingQuery['deed'] })} className="w-36">
            <option value="">{t('filter.allDeeds')}</option>
            {deeds.map((deed) => (
              <option key={deed} value={deed}>
                {labels.deed[deed]}
              </option>
            ))}
          </Select>
        ) : null}
        {activeFilters > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted">
            <X aria-hidden className="h-3.5 w-3.5" />
            {t('filter.clear')}
          </Button>
        ) : null}
      </div>

      {tags.length > 0 ? (
        <div role="group" aria-label={t('filter.featuresAria')} className="flex flex-wrap items-center gap-2" data-testid="filter-features">
          <span className="text-[13px] font-semibold text-ink-2">{t('filter.features')}</span>
          {tags.map((feature) => {
            const on = query.features.includes(feature);
            return (
              <Checkbox
                key={feature}
                checked={on}
                label={labels.feature[feature]}
                onChange={(next) => toggleTag(feature, next)}
                className={cn('rounded-xl border px-3 py-1.5', on ? 'border-primary bg-primary-tint text-primary' : 'border-line bg-surface')}
              >
                {labels.feature[feature]}
              </Checkbox>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
