'use client';

import { CalendarClock, Crown, Layers } from 'lucide-react';
import type { Wallet } from '@bongah/shared-types';
import { formatDate, formatNumber } from '@/lib/format';
import { PLAN_LABEL } from '@/lib/labels';
import { summarizeQuota } from '@/lib/quota';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';

export function CurrentPlan({ wallet }: { wallet: Wallet }) {
  const sub = wallet.subscription;
  const quota = summarizeQuota(wallet);
  const active = !!sub?.is_active && !!sub.package_type;
  const pct = quota && quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader
        title="اشتراک فعلی"
        action={
          active ? (
            <Badge tone="solid">
              <Crown aria-hidden className="h-3.5 w-3.5" />
              {PLAN_LABEL[sub!.package_type!]}
            </Badge>
          ) : (
            <Badge tone="neutral">بدون اشتراک فعال</Badge>
          )
        }
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <CalendarClock aria-hidden className="h-4 w-4" />
            زمان باقی‌مانده
          </div>
          {active ? (
            <>
              <div className="tabular mt-2 text-2xl font-extrabold text-ink">
                {formatNumber(sub!.remaining_days)} <span className="text-sm font-semibold text-muted">روز</span>
              </div>
              <p className="mt-1 text-xs text-muted">تا {formatDate(sub!.ends_at)}</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] leading-6 text-muted">برای ثبت آگهی‌های بیشتر و ابزارهای دفتر، یکی از بسته‌های زیر را بگیرید.</p>
          )}
          {sub?.queued?.length ? (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-2">
              {sub.queued.map((q) => (
                <li key={q.starts_at}>
                  بستهٔ {PLAN_LABEL[q.package_type]} از {formatDate(q.starts_at)} شروع می‌شود
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Layers aria-hidden className="h-4 w-4" />
            سهمیهٔ آگهی
          </div>
          {quota ? (
            <>
              <div className="tabular mt-2 text-2xl font-extrabold text-ink">
                {quota.remaining === null ? 'نامحدود' : formatNumber(quota.remaining)}
                <span className="ms-1 text-sm font-semibold text-muted">آگهی باقی‌مانده</span>
              </div>
              {quota.limit ? (
                <div className="mt-3">
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={quota.limit}
                    aria-valuenow={quota.used}
                    aria-label="مصرف سهمیه"
                    className="h-2 overflow-hidden rounded-full bg-soft"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="tabular mt-1.5 text-xs text-muted">
                    {formatNumber(quota.used)} از {formatNumber(quota.limit)} استفاده شده
                    {quota.extra ? ` · ${formatNumber(quota.extra)} آگهی هدیه` : ''}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
          <p className="tabular mt-3 border-t border-line pt-3 text-xs text-ink-2">
            {formatNumber(wallet.ladder_tokens)} نردبان · {formatNumber(wallet.contact_credits)} اعتبار تماس
          </p>
        </div>
      </div>
    </Card>
  );
}
