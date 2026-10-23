'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, LayoutList, Phone, TrendingUp, Layers } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { summarizeQuota } from '@/lib/quota';
import { useAnalytics, useDashboard, useWallet } from '@/hooks/use-api';
import { DashboardBanners } from '@/components/dashboard/banners';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { RecentListings } from '@/components/dashboard/recent-listings';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ChartSkeleton, StatCardSkeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/lib/cn';

const RANGES = [7, 30, 90] as const;

export default function OverviewPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const dashboard = useDashboard();
  const wallet = useWallet();
  const analytics = useAnalytics(days);
  const quota = summarizeQuota(wallet.data);

  const stats = dashboard.data?.stats;
  const totals = analytics.data?.totals;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <DashboardBanners dashboard={dashboard.data} wallet={wallet.data} />

      <section aria-label="آمار" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!dashboard.data && !dashboard.error ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="آگهی‌های فعال"
              icon={LayoutList}
              href="/dashboard/listings"
              value={formatNumber(stats?.active_listings ?? 0)}
              hint={`از ${formatNumber(stats?.total_properties ?? 0)} آگهی · ${formatNumber(stats?.featured_listings ?? 0)} با کادر ویژه`}
            />
            <StatCard
              label="کل بازدیدها"
              icon={Eye}
              tone="info"
              value={formatNumber(analytics.data?.lifetime_views ?? stats?.total_views ?? 0)}
              hint={totals ? `${formatNumber(totals.views)} بازدید در ${formatNumber(days)} روز اخیر` : 'در حال محاسبه…'}
            />
            <StatCard
              label="تماس‌ها و پیام‌ها"
              icon={Phone}
              tone="gold"
              value={totals ? formatNumber(totals.phone_reveals + totals.leads) : '—'}
              hint={
                totals
                  ? `${formatNumber(totals.phone_reveals)} تماس · ${formatNumber(totals.leads)} پیام (${formatNumber(days)} روز اخیر)`
                  : 'در حال محاسبه…'
              }
            />
            <StatCard
              label="سهمیه و نردبان باقی‌مانده"
              icon={Layers}
              href="/dashboard/subscription"
              value={
                quota ? (
                  <span className="flex items-baseline gap-2">
                    {quota.remaining === null ? 'نامحدود' : formatNumber(quota.remaining)}
                    <span className="text-sm font-semibold text-muted">آگهی</span>
                  </span>
                ) : (
                  '—'
                )
              }
              hint={
                quota
                  ? `${formatNumber(quota.ladders)} نردبان${quota.extra ? ` · ${formatNumber(quota.extra)} آگهی هدیه` : ''}`
                  : undefined
              }
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="عملکرد آگهی‌ها"
            description="بازدید، پیام و تماس به تفکیک روز (به وقت کابل)"
            action={
              <div role="group" aria-label="بازه زمانی" className="flex rounded-xl bg-soft p-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setDays(r)}
                    aria-pressed={days === r}
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
                      days === r ? 'bg-surface text-primary ring-1 ring-line' : 'text-ink-2 hover:text-primary',
                    )}
                  >
                    {formatNumber(r)} روز
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-5 pb-5 pt-4">
            {!analytics.data && !analytics.error ? (
              <ChartSkeleton />
            ) : analytics.error && !analytics.data ? (
              <ErrorState message="نمودار بارگذاری نشد." onRetry={() => void analytics.mutate()} />
            ) : analytics.data ? (
              <PerformanceChart analytics={analytics.data} />
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="پربازدیدترین آگهی‌ها" description="آگهی‌های فعال، بیشترین بازدید اول" />
          <div className="mt-3 pb-2">
            {!dashboard.data && !dashboard.error ? (
              <div className="space-y-4 px-5 pb-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" aria-hidden />
                ))}
              </div>
            ) : dashboard.data && dashboard.data.top_listings.length === 0 ? (
              <EmptyState compact icon={TrendingUp} title="هنوز بازدیدی نیست" description="وقتی آگهی‌هایتان بازدید بگیرند، اینجا دیده می‌شوند." />
            ) : (
              <ol className="divide-y divide-line">
                {dashboard.data?.top_listings.map((l, i) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-soft text-xs font-bold text-ink-2">
                      {formatNumber(i + 1)}
                    </span>
                    <Link href={`/dashboard/listings?q=${encodeURIComponent(l.title)}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink hover:text-primary">
                      {l.title}
                    </Link>
                    <span className="tabular flex items-center gap-1 text-xs text-muted">
                      <Eye aria-hidden className="h-3.5 w-3.5" />
                      {formatNumber(l.view_count)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>

      <RecentListings />
    </div>
  );
}
