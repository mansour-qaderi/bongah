'use client';

import type { Market, PriceTerms } from '@bongah/shared-types';
import { useLanguage } from '@/i18n/provider';
import { labelsFor } from '@/lib/labels';
import { useActiveMarket } from '@/hooks/use-active-market';
import { cn } from '@/lib/cn';

/**
 * «جورآمد» (in Iran «قابل توافق») / «مقطوع» beside a price: the word the owner gave for whether the price can be talked
 * down, in the words of the listing's own market. Shows nothing when the owner did not say (a missing tag is better
 * than a guessed one).
 */
export function PriceTermsTag({
  terms,
  market,
  className,
}: {
  terms: PriceTerms | null | undefined;
  market?: Market;
  className?: string;
}) {
  const { language } = useLanguage();
  const active = useActiveMarket();
  const labels = labelsFor(language, market ?? active);
  if (!terms) return null;
  return (
    <span
      data-testid="price-terms"
      data-terms={terms}
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold leading-4',
        terms === 'NEGOTIABLE' ? 'bg-primary-tint text-primary-dark' : 'bg-soft text-ink-2',
        className,
      )}
    >
      {labels.terms[terms]}
    </span>
  );
}
