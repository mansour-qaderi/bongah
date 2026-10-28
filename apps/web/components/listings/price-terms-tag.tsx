'use client';

import type { PriceTerms } from '@bongah/shared-types';
import { useLabels } from '@/i18n/use-labels';
import { cn } from '@/lib/cn';

/**
 * «جورآمد» / «مقطوع» beside a price: the word the owner gave for whether the price can be talked down. Shows nothing
 * when the owner did not say (a missing tag is better than a guessed one).
 */
export function PriceTermsTag({ terms, className }: { terms: PriceTerms | null | undefined; className?: string }) {
  const labels = useLabels();
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
