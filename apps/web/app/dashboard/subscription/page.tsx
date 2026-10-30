'use client';

import { CurrentPlan } from '@/components/subscription/current-plan';
import { PaymentsTable } from '@/components/subscription/payments-table';
import { PlanCards } from '@/components/subscription/plan-cards';
import { ReferralCard } from '@/components/subscription/referral-card';
import { TopUps } from '@/components/subscription/topups';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { usePricing, useReferrals, useWallet } from '@/hooks/use-api';
import { useT } from '@/i18n/provider';
import { useActiveMarket } from '@/hooks/use-active-market';

export default function SubscriptionPage() {
  const t = useT();
  const wallet = useWallet();
  const pricing = usePricing();
  const referrals = useReferrals();
  const market = useActiveMarket();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-ink">{t('sub.page.title')}</h1>
        <p className="mt-1 text-[13px] text-muted">{t('sub.page.subtitle')}</p>
        <p className="mt-1 text-[13px] font-semibold text-ink-2" data-testid="pay-market-note">
          {t(market === 'IR' ? 'sub.pay.IR' : 'sub.pay.AF')}
        </p>
      </div>

      {wallet.data ? (
        <CurrentPlan wallet={wallet.data} />
      ) : wallet.error ? (
        <Card>
          <ErrorState message={errorMessage(wallet.error)} onRetry={() => void wallet.mutate()} />
        </Card>
      ) : (
        <Card className="p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </Card>
      )}

      {pricing.data ? (
        <>
          <PlanCards pricing={pricing.data} wallet={wallet.data} />
          <TopUps pricing={pricing.data} />
        </>
      ) : pricing.error ? (
        <Card>
          <ErrorState message={errorMessage(pricing.error)} onRetry={() => void pricing.mutate()} />
        </Card>
      ) : (
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <ReferralCard data={referrals.data} error={referrals.error} loading={!referrals.data && !referrals.error} onRetry={() => void referrals.mutate()} />
        <PaymentsTable />
      </div>
    </div>
  );
}
