'use client';

import Link from 'next/link';
import { AlertTriangle, Clock3, Sparkles } from 'lucide-react';
import type { AgencyDashboard, Wallet } from '@bongah/shared-types';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

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

/** Things the office needs to know first: its documents are not approved, or it has no plan running. */
export function DashboardBanners({ dashboard, wallet }: { dashboard?: AgencyDashboard; wallet?: Wallet }) {
  const status = dashboard?.agency.verification_status;
  const noPlan = wallet?.subscription && !wallet.subscription.is_active;
  return (
    <div className="space-y-3 empty:hidden">
      {status === 'PENDING' ? (
        <Banner tone="gold" icon={<Clock3 className="h-4 w-4" />}>
          مدارک دفتر در حال بررسی است. تا زمان تأیید، نشان «تأیید شده» روی آگهی‌های شما نمایش داده نمی‌شود.
        </Banner>
      ) : null}
      {status === 'REJECTED' ? (
        <Banner tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
          مدارک دفتر رد شد{dashboard?.agency.rejection_reason ? `: ${dashboard.agency.rejection_reason}` : '.'} مدرک را در اپلیکیشن بنگاه اصلاح و دوباره
          بفرستید.
        </Banner>
      ) : null}
      {noPlan ? (
        <Banner tone="info" icon={<Sparkles className="h-4 w-4" />}>
          اشتراک فعالی ندارید. با اشتراک، ثبت گروهی آگهی، سهمیه بیشتر و هدیه‌های اولین خرید را دریافت می‌کنید.{' '}
          <Link href="/dashboard/subscription" className="font-bold underline">
            دیدن پلن‌ها
          </Link>
        </Banner>
      ) : null}
    </div>
  );
}
