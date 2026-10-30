'use client';

import { ChevronDown } from 'lucide-react';
import type { Market, PropertyFeature } from '@bongah/shared-types';
import { featuresFor } from '@/lib/market';
import { useLabelsFor } from '@/hooks/use-market';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { DropdownCheckItem, DropdownContent, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';

/**
 * The tags of a listing (elevator, parking…) as one cell: a button that says how many are ticked and opens the list.
 * Only Iran has tags; in a market without any the cell is empty.
 */
export function FeaturesCell({
  market,
  value,
  onChange,
  label,
  className,
  invalid,
}: {
  market: Market;
  value: readonly PropertyFeature[];
  onChange: (next: PropertyFeature[]) => void;
  label: string;
  className?: string;
  invalid?: boolean;
}) {
  const t = useT();
  const labels = useLabelsFor(market);
  const options = featuresFor(market);
  if (options.length === 0) return <span className="px-2 text-muted">—</span>;
  const picked = options.filter((feature) => value.includes(feature));
  return (
    <DropdownRoot>
      <DropdownTrigger
        aria-label={label}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-1 rounded-lg border bg-surface px-2 text-start text-[13px] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          invalid ? 'border-danger' : 'border-line',
          className,
        )}
      >
        <span className="truncate">{picked.length ? picked.map((feature) => labels.feature[feature]).join('، ') : t('form.unspecified')}</span>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
      </DropdownTrigger>
      <DropdownContent align="start">
        {options.map((feature) => (
          <DropdownCheckItem
            key={feature}
            checked={picked.includes(feature)}
            onChange={(next) => onChange(options.filter((x) => (x === feature ? next : picked.includes(x))))}
          >
            {labels.feature[feature]}
          </DropdownCheckItem>
        ))}
      </DropdownContent>
    </DropdownRoot>
  );
}
