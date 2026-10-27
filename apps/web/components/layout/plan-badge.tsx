'use client';

import Link from 'next/link';
import { Wallet as WalletIcon } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { useLabels } from '@/i18n/use-labels';
import { useT } from '@/i18n/provider';
import { useWallet } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/** The running plan with its days left, or a link to buy one. Lives in the header and, on narrow screens, in the account menu. */
export function PlanBadge() {
  const t = useT();
  const labels = useLabels();
  const { data: wallet, error } = useWallet();
  if (!wallet && !error) return <Skeleton className="h-7 w-28 rounded-full" />;
  const sub = wallet?.subscription;
  if (sub?.is_active && sub.package_type) {
    return (
      <Link href="/dashboard/subscription" aria-label={t('plan.badge.details')}>
        <Badge tone="gold" className="gap-1.5 py-1 text-[13px]">
          <WalletIcon aria-hidden className="h-3.5 w-3.5" />
          {t('plan.badge.active', { plan: labels.plan[sub.package_type] })}
          <span className="font-normal text-accent-text/80">· {t('plan.badge.daysLeft', { days: formatNumber(sub.remaining_days) })}</span>
        </Badge>
      </Link>
    );
  }
  return (
    <Link href="/dashboard/subscription" aria-label={t('plan.badge.buy')}>
      <Badge tone="neutral" className="gap-1.5 border-line-strong py-1 text-[13px] hover:border-primary hover:text-primary">
        <WalletIcon aria-hidden className="h-3.5 w-3.5" />
        {t('plan.badge.none')}
      </Badge>
    </Link>
  );
}
