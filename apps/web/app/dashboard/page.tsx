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
import { useT } from '@/i18n/provider';
import { useMarketT } from '@/i18n/use-labels';

const RANGES = [7, 30, 90] as const;

export default function OverviewPage() {
  const t = useT();
  const tm = useMarketT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const dashboard = useDashboard();
  const wallet = useWallet();
  const analytics = useAnalytics(days);
  const quota = summarizeQuota(wallet.data);

  const stats = dashboard.data?.stats;
  const totals = analytics.data?.totals;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <DashboardBanners wallet={wallet.data} />

      <section aria-label={t('dash.stats.aria')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!dashboard.data && !dashboard.error ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label={t('dash.active.label')}
              icon={LayoutList}
              href="/dashboard/listings"
              value={formatNumber(stats?.active_listings ?? 0)}
              hint={t('dash.active.hint', { total: formatNumber(stats?.total_properties ?? 0), featured: formatNumber(stats?.featured_listings ?? 0) })}
            />
            <StatCard
              label={t('dash.views.label')}
              icon={Eye}
              tone="info"
              value={formatNumber(analytics.data?.lifetime_views ?? stats?.total_views ?? 0)}
              hint={totals ? t('dash.views.hint', { views: formatNumber(totals.views), days: formatNumber(days) }) : t('common.calculating')}
            />
            <StatCard
              label={t('dash.contacts.label')}
              icon={Phone}
              tone="gold"
              value={totals ? formatNumber(totals.phone_reveals + totals.leads) : '—'}
              hint={
                totals
                  ? t('dash.contacts.hint', { calls: formatNumber(totals.phone_reveals), messages: formatNumber(totals.leads), days: formatNumber(days) })
                  : t('common.calculating')
              }
            />
            <StatCard
              label={t('dash.quota.label')}
              icon={Layers}
              href="/dashboard/subscription"
              value={
                quota ? (
                  <span className="flex items-baseline gap-2">
                    {quota.remaining === null ? t('dash.quota.unlimited') : formatNumber(quota.remaining)}
                    <span className="text-sm font-semibold text-muted">{t('dash.quota.unit')}</span>
                  </span>
                ) : (
                  '—'
                )
              }
              hint={
                quota
                  ? t('dash.quota.hint', { ladders: formatNumber(quota.ladders) }) +
                    (quota.extra ? t('dash.quota.gift', { extra: formatNumber(quota.extra) }) : '')
                  : undefined
              }
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('dash.perf.title')}
            description={tm('dash.perf.desc')}
            action={
              <div role="group" aria-label={t('dash.perf.range')} className="flex rounded-xl bg-soft p-1">
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
                    {t('time.days', { n: formatNumber(r) })}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-5 pb-5 pt-4">
            {!analytics.data && !analytics.error ? (
              <ChartSkeleton />
            ) : analytics.error && !analytics.data ? (
              <ErrorState message={t('dash.perf.error')} onRetry={() => void analytics.mutate()} />
            ) : analytics.data ? (
              <PerformanceChart analytics={analytics.data} />
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('dash.top.title')} description={t('dash.top.desc')} />
          <div className="mt-3 pb-2">
            {!dashboard.data && !dashboard.error ? (
              <div className="space-y-4 px-5 pb-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" aria-hidden />
                ))}
              </div>
            ) : dashboard.data && dashboard.data.top_listings.length === 0 ? (
              <EmptyState compact icon={TrendingUp} title={t('dash.top.emptyTitle')} description={t('dash.top.emptyText')} />
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
