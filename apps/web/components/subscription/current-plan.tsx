'use client';

import { CalendarClock, Crown, Layers } from 'lucide-react';
import type { Wallet } from '@bongah/shared-types';
import { formatDate, formatNumber } from '@/lib/format';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { summarizeQuota } from '@/lib/quota';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

export function CurrentPlan({ wallet }: { wallet: Wallet }) {
  const t = useT();
  const labels = useLabels();
  const sub = wallet.subscription;
  const quota = summarizeQuota(wallet);
  const active = !!sub?.is_active && !!sub.package_type;
  const pct = quota && quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader
        title={t('sub.current.title')}
        action={
          active ? (
            <Badge tone="solid">
              <Crown aria-hidden className="h-3.5 w-3.5" />
              {labels.plan[sub!.package_type!]}
            </Badge>
          ) : (
            <Badge tone="neutral">{t('sub.current.none')}</Badge>
          )
        }
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <CalendarClock aria-hidden className="h-4 w-4" />
            {t('sub.current.remaining')}
          </div>
          {active ? (
            <>
              <div className="tabular mt-2 text-2xl font-extrabold text-ink">
                {formatNumber(sub!.remaining_days)} <span className="text-sm font-semibold text-muted">{t('sub.current.days')}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{t('sub.current.until', { date: formatDate(sub!.ends_at) })}</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] leading-6 text-muted">{t('sub.current.noPlanText')}</p>
          )}
          {sub?.queued?.length ? (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-2">
              {sub.queued.map((q) => (
                <li key={q.starts_at}>
                  {t('sub.current.queued', { plan: labels.plan[q.package_type], date: formatDate(q.starts_at) })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Layers aria-hidden className="h-4 w-4" />
            {t('sub.current.quota')}
          </div>
          {quota ? (
            <>
              <div className="tabular mt-2 text-2xl font-extrabold text-ink">
                {quota.remaining === null ? t('dash.quota.unlimited') : formatNumber(quota.remaining)}
                <span className="ms-1 text-sm font-semibold text-muted">{t('sub.current.quotaLeft')}</span>
              </div>
              {quota.limit ? (
                <div className="mt-3">
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={quota.limit}
                    aria-valuenow={quota.used}
                    aria-label={t('sub.current.quotaAria')}
                    className="h-2 overflow-hidden rounded-full bg-soft"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="tabular mt-1.5 text-xs text-muted">
                    {t('sub.current.used', { used: formatNumber(quota.used), limit: formatNumber(quota.limit) })}
                    {quota.extra ? t('dash.quota.gift', { extra: formatNumber(quota.extra) }) : ''}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
          <p className="tabular mt-3 border-t border-line pt-3 text-xs text-ink-2">
            {t('sub.current.credits', { ladders: formatNumber(wallet.ladder_tokens), credits: formatNumber(wallet.contact_credits) })}
          </p>
        </div>
      </div>
    </Card>
  );
}
