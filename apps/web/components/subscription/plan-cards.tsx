'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Sparkles } from 'lucide-react';
import { SUBSCRIPTION_PACKAGES, type Pricing, type SubscriptionPackage, type Wallet } from '@bongah/shared-types';
import { errorMessage } from '@/lib/api';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { formatMoney, formatNumber } from '@/lib/format';
import { announcePaid, startPayment } from '@/lib/payments';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';

const MONTHS: Record<SubscriptionPackage, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, YEARLY: 12 };

export function PlanCards({ pricing, wallet }: { pricing: Pricing; wallet: Wallet | undefined }) {
  const t = useT();
  const labels = useLabels();
  const [busy, setBusy] = useState<SubscriptionPackage | null>(null);
  const current = wallet?.subscription?.is_active ? wallet.subscription.package_type : null;

  async function buy(plan: SubscriptionPackage) {
    setBusy(plan);
    try {
      const outcome = await startPayment({ purpose: 'SUBSCRIPTION', package_type: plan });
      // 'redirected' leaves the page; 'manual' opens the pay-by-hand dialog over it, so the button is free again.
      if (outcome === 'completed') await announcePaid('SUBSCRIPTION');
      if (outcome !== 'redirected') setBusy(null);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t('sub.plans.title')}
        description={
          current
            ? t('sub.plans.descCurrent')
            : t('sub.plans.descNew')
        }
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {SUBSCRIPTION_PACKAGES.map((plan) => {
          const price = pricing.subscription[plan];
          const list = pricing.subscription_list?.[plan];
          const saving = list && list > price ? Math.round(((list - price) / list) * 100) : 0;
          const benefits = pricing.plans?.[plan];
          const best = plan === 'YEARLY';
          const monthly = price / MONTHS[plan];
          return (
            <div
              key={plan}
              className={cn('relative flex flex-col rounded-2xl border p-5', best ? 'border-primary bg-primary-tint/40' : 'border-line')}
            >
              {best ? (
                <Badge tone="solid" className="absolute -top-3 start-4">
                  <Sparkles aria-hidden className="h-3 w-3" />
                  {t('sub.plans.best')}
                </Badge>
              ) : null}
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-ink">{labels.plan[plan]}</h3>
                {current === plan ? <Badge tone="primary">{t('sub.plans.current')}</Badge> : null}
              </div>
              <div className="tabular mt-3 text-2xl font-extrabold text-ink">{formatMoney(price, pricing.currency)}</div>
              {saving > 0 ? (
                <p className="tabular mt-1 text-xs text-muted">
                  <span className="line-through">{formatMoney(list!, pricing.currency)}</span>{' '}
                  <span className="font-bold text-primary">{t('sub.discount', { percent: formatNumber(saving) })}</span>
                </p>
              ) : MONTHS[plan] > 1 ? null : (
                <p className="mt-1 text-xs text-muted">{t('sub.plans.forMonth')}</p>
              )}
              {MONTHS[plan] > 1 ? (
                <p className="tabular mt-1 text-xs text-muted">{t('sub.plans.perMonth', { price: formatMoney(Math.round(monthly), pricing.currency) })}</p>
              ) : null}
              {benefits ? (
                <ul className="mt-4 space-y-2 text-[13px] text-ink-2">
                  <Benefit>{t('sub.plans.listings', { n: formatNumber(benefits.listings) })}</Benefit>
                  {benefits.gift_listings ? <Benefit>{t('sub.plans.giftListings', { n: formatNumber(benefits.gift_listings) })}</Benefit> : null}
                  {benefits.gift_featured ? <Benefit>{t('sub.plans.giftFeatured', { n: formatNumber(benefits.gift_featured) })}</Benefit> : null}
                  {benefits.business_accounting ? <Benefit>{t('sub.plans.accounting')}</Benefit> : null}
                  {benefits.public_portfolio ? <Benefit>{t('sub.plans.portfolio')}</Benefit> : null}
                </ul>
              ) : null}
              <Button
                className="mt-5 w-full justify-center"
                variant={best ? 'primary' : 'secondary'}
                loading={busy === plan}
                disabled={busy !== null}
                onClick={() => void buy(plan)}
              >
                {current ? t('sub.plans.add') : t('sub.plans.buy')}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="px-5 pb-5 text-xs text-muted">{t('sub.plans.footer')}</p>
    </Card>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}
