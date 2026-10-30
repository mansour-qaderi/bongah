'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Gift, LayoutList, MessageSquareText, MessageCircleHeart, ShieldCheck, Store, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { AdminOverview } from '@bongah/shared-types';
import { errorMessage, fetcher } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/provider';
import type { MessageKey } from '@/i18n/translate';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { StatCardSkeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { AdminPage } from './admin-kit';

const RANGES = [7, 30, 90] as const;

const SECTIONS: { href: string; title: MessageKey; text: MessageKey; icon: LucideIcon }[] = [
  { href: '/dashboard/admin/listings', title: 'nav.adminListings', text: 'adm.sec.listings', icon: LayoutList },
  { href: '/dashboard/admin/agencies', title: 'nav.adminAgencies', text: 'adm.sec.agencies', icon: Store },
  { href: '/dashboard/admin/users', title: 'nav.adminUsers', text: 'adm.sec.users', icon: Users },
  { href: '/dashboard/admin/payments', title: 'nav.adminPayments', text: 'adm.sec.payments', icon: ShieldCheck },
  { href: '/dashboard/admin/feedback', title: 'nav.adminFeedback', text: 'adm.sec.feedback', icon: MessageSquareText },
  { href: '/dashboard/admin/gifts', title: 'nav.adminGifts', text: 'adm.sec.gifts', icon: Gift },
  { href: '/dashboard/admin/greetings', title: 'nav.adminGreetings', text: 'adm.sec.greetings', icon: MessageCircleHeart },
];

/** The admin's landing page: the platform in numbers for the last days, and a door to every admin section. */
export function AdminHome() {
  const t = useT();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const overview = useSWR<AdminOverview>(`admin/analytics/overview?days=${days}`, fetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const o = overview.data;

  return (
    <AdminPage title={t('adm.home.title')} subtitle={t('adm.home.subtitle')} wide>
      <div role="group" aria-label={t('adm.home.range', { days: formatNumber(days) })} className="flex w-fit rounded-xl bg-soft p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setDays(r)}
            aria-pressed={days === r}
            className={cn('rounded-lg px-3 py-1 text-xs font-semibold transition-colors', days === r ? 'bg-surface text-primary ring-1 ring-line' : 'text-ink-2 hover:text-primary')}
          >
            {t('time.days', { n: formatNumber(r) })}
          </button>
        ))}
      </div>

      {overview.error && !o ? (
        <Card>
          <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.mutate()} />
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="admin-home-stats">
          {!o ? (
            Array.from({ length: 5 }, (_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                label={t('adm.home.users')}
                icon={Users}
                href="/dashboard/admin/users"
                value={formatNumber(o.users.total)}
                hint={t('adm.home.usersHint', { count: formatNumber(o.users.new_in_range) })}
              />
              <StatCard
                label={t('adm.home.listings')}
                icon={LayoutList}
                tone="info"
                href="/dashboard/admin/listings"
                value={formatNumber(o.listings.active)}
                hint={t('adm.home.listingsHint', { count: formatNumber(o.listings.new_in_range) })}
              />
              <StatCard
                label={t('adm.home.agencies')}
                icon={Store}
                tone="gold"
                href="/dashboard/admin/agencies"
                value={formatNumber(o.agencies.with_active_subscription)}
                hint={t('adm.home.agenciesHint', { count: formatNumber(o.agencies.verified) })}
              />
              <StatCard
                label={t('adm.home.waiting')}
                icon={ShieldCheck}
                href="/dashboard/admin/agencies"
                value={formatNumber(o.moderation.pending_verifications + o.moderation.open_reports)}
                hint={t('adm.home.waitingHint', { verifications: formatNumber(o.moderation.pending_verifications), reports: formatNumber(o.moderation.open_reports) })}
              />
              <StatCard
                label={t('adm.home.revenue')}
                icon={Wallet}
                tone="gold"
                href="/dashboard/admin/payments"
                value={
                  o.revenue.in_range.length === 0 ? (
                    <span className="text-base font-bold text-muted">{t('adm.home.noRevenue')}</span>
                  ) : (
                    <span className="flex flex-col gap-1 text-[20px]">
                      {o.revenue.in_range.map((m) => (
                        <span key={m.currency}>{formatMoney(m.total, m.currency)}</span>
                      ))}
                    </span>
                  )
                }
              />
            </>
          )}
        </section>
      )}

      <Card>
        <CardHeader title={t('adm.home.sections')} />
        <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="admin-home-sections">
          {SECTIONS.map(({ href, title, text, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex h-full items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-primary">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
                  <Icon aria-hidden className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">{t(title)}</span>
                  <span className="mt-0.5 block text-xs leading-6 text-muted">{t(text)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </AdminPage>
  );
}
