'use client';

import { Crosshair, MapPin, Star } from 'lucide-react';
import type { AgencyListingPin } from '@bongah/shared-types';
import { DEAL_COLOR } from '@/lib/labels';
import { listingPrice } from '@/lib/price';
import { provinceNameLabel } from '@/lib/provinces';
import { useLanguage, useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { cn } from '@/lib/cn';

/** Where the listing is, in the words people use: district, then province. */
export function locationLine(p: Pick<AgencyListingPin, 'district' | 'province'>, provinceLabel: (province: string) => string): string {
  return [p.district, p.province ? provinceLabel(p.province) : ''].filter(Boolean).join('، ');
}

/**
 * One listing in the map's side list: price first, the deal as a coloured badge (the same colours as its pin), the
 * type, where it is, and, for one that has no pin yet, the button that puts it on the map. The whole card is the
 * button that focuses the listing.
 */
export function MapListingCard({
  listing,
  placed,
  selected,
  onSelect,
  onPlace,
}: {
  listing: AgencyListingPin;
  placed: boolean;
  selected: boolean;
  onSelect: () => void;
  onPlace?: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const color = DEAL_COLOR[listing.deal_type];
  const sold = listing.status === 'SOLD';
  const where = locationLine(listing, (province) => provinceNameLabel(province, language));

  return (
    <div
      data-testid="map-card"
      data-selected={selected || undefined}
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong',
        sold && 'opacity-80',
      )}
    >
      <button type="button" onClick={onSelect} aria-current={selected || undefined} className="block w-full px-3 pb-2.5 pt-3 text-start">
        <div className="flex items-start justify-between gap-2">
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ background: color.main, color: color.on }}
          >
            {labels.deal[listing.deal_type]}
          </span>
          <div className="flex items-center gap-1.5">
            {sold ? (
              <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted">{labels.status.SOLD}</span>
            ) : null}
            {listing.is_featured ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                <Star aria-hidden className="h-3 w-3" fill="currentColor" />
                {t('list.col.featured')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tabular mt-2 text-base font-extrabold text-ink">{listingPrice(listing)}</div>
        <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-6 text-ink-2">{listing.title}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {labels.type[listing.type]}
            {where ? ` · ${where}` : ''}
          </span>
        </div>
      </button>
      {!placed && onPlace ? (
        <div className="border-t border-line bg-soft/60 px-3 py-2">
          <button
            type="button"
            onClick={onPlace}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark"
          >
            <Crosshair aria-hidden className="h-3.5 w-3.5" />
            {t('map.place')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
