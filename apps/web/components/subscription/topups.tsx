'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import type { FeaturedBundle, Pricing } from '@bongah/shared-types';
import { errorMessage } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { announcePaid, startPayment } from '@/lib/payments';
import { useT } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';

export function TopUps({ pricing, featuredCredits }: { pricing: Pricing; featuredCredits?: number }) {
  const t = useT();
  const [busy, setBusy] = useState<number | null>(null);
  const bundles: FeaturedBundle[] = pricing.featured_bundles ?? [];

  async function buyBundle(size: FeaturedBundle['size']) {
    setBusy(size);
    try {
      const outcome = await startPayment({ purpose: 'FEATURED_CREDITS', bundle_size: size as 1 | 3 | 5 | 10 | 20 });
      if (outcome === 'completed') await announcePaid('FEATURED_CREDITS');
      if (outcome !== 'redirected') setBusy(null);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title={t('sub.featured.title')}
          description={t('sub.featured.desc', { days: formatNumber(pricing.featured_ad_days) })}
          action={
            featuredCredits !== undefined ? (
              <span className="tabular rounded-full bg-accent-tint px-3 py-1 text-xs font-bold text-accent-text">
                {t('sub.featured.inAccount', { n: formatNumber(featuredCredits) })}
              </span>
            ) : null
          }
        />
        <div className="p-5">
          {bundles.length === 0 ? (
            <p className="text-[13px] text-muted">{t('sub.featured.none')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {bundles.map((b) => (
                <li key={b.size} className="flex flex-col rounded-xl border border-line p-3">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    <Star aria-hidden className="h-4 w-4 text-accent-bright" />
                    {t('sub.featured.count', { n: formatNumber(b.size) })}
                    {b.discount_percent > 0 ? <span className="ms-auto text-xs font-bold text-primary">{t('sub.discount', { percent: formatNumber(b.discount_percent) })}</span> : null}
                  </div>
                  <div className="tabular mt-2 text-base font-extrabold text-ink">{formatMoney(b.price, pricing.currency)}</div>
                  {b.list_price > b.price ? (
                    <div className="tabular text-xs text-muted line-through">{formatMoney(b.list_price, pricing.currency)}</div>
                  ) : (
                    <div className="h-4" />
                  )}
                  <Button size="sm" variant="secondary" className="mt-3 w-full justify-center" loading={busy === b.size} disabled={busy !== null} onClick={() => void buyBundle(b.size)}>
                    {t('sub.buy')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
