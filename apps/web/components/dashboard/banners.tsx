'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { Wallet } from '@bongah/shared-types';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/provider';

function Banner({ tone, icon, children }: { tone: 'gold' | 'danger' | 'info'; icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'reveal flex items-start gap-3 rounded-2xl border px-4 py-3 text-[13px] leading-6',
        tone === 'gold' && 'border-accent-bright/50 bg-accent-tint text-accent-text',
        tone === 'danger' && 'border-danger/30 bg-danger-tint text-danger',
        tone === 'info' && 'border-info/30 bg-info-tint text-info',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** What the account should know first: it has no plan running. */
export function DashboardBanners({ wallet }: { wallet?: Wallet }) {
  const t = useT();
  const noPlan = wallet?.subscription && !wallet.subscription.is_active;
  return (
    <div className="space-y-3 empty:hidden">
      {noPlan ? (
        <Banner tone="info" icon={<Sparkles className="h-4 w-4" />}>
          {t('dash.banner.noPlan')}{' '}
          <Link href="/dashboard/subscription" className="font-bold underline">
            {t('dash.banner.seePlans')}
          </Link>
        </Banner>
      ) : null}
    </div>
  );
}
