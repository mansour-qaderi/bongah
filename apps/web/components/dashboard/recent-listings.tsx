'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { FilePlus2, Eye } from 'lucide-react';
import type { Paginated, Property } from '@bongah/shared-types';
import { fetcher } from '@/lib/api';
import { formatMoney, formatNumber, formatRelative } from '@/lib/format';
import { DEAL_LABEL, TYPE_LABEL } from '@/lib/labels';
import { SYNC_INTERVAL_MS } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { StatusActions, useStatusChange } from '@/components/listings/status-toggle';

const KEY = 'properties/mine?status=ACTIVE&sort=newest&limit=8';

export function RecentListings() {
  const { data, error, mutate } = useSWR<Paginated<Property>>(KEY, fetcher, {
    refreshInterval: SYNC_INTERVAL_MS,
    keepPreviousData: true,
  });
  const { change, isPending } = useStatusChange();

  return (
    <Card>
      <CardHeader
        title="آخرین آگهی‌های فعال"
        description="وضعیت را همین‌جا عوض کنید؛ تغییر در اپلیکیشن هم دیده می‌شود."
        action={
          <Link href="/dashboard/listings" className="text-[13px] font-semibold text-primary hover:underline">
            همه آگهی‌ها
          </Link>
        }
      />
      <div className="mt-3">
        {!data && !error ? (
          <TableRowsSkeleton rows={5} cols={5} />
        ) : error && !data ? (
          <ErrorState message="فهرست آگهی‌ها بارگذاری نشد." onRetry={() => void mutate()} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title="هنوز آگهی فعالی ندارید"
            description="اولین آگهی را ثبت کنید، یا چند آگهی را یک‌جا از متن تلگرام یا فایل اکسل وارد کنید."
            action={
              <Link href="/dashboard/listings/quick-add">
                <Button>ثبت آگهی جدید</Button>
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {data?.data.map((p) => (
              <li key={p.id} className="reveal flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="truncate text-sm font-semibold text-ink">{p.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <Badge tone={p.deal_type === 'SALE' ? 'primary' : p.deal_type === 'RENT' ? 'info' : 'gold'}>
                      {DEAL_LABEL[p.deal_type]}
                    </Badge>
                    <span>{TYPE_LABEL[p.type]}</span>
                    <span>·</span>
                    <span>{p.district || p.province}</span>
                    <span>·</span>
                    <span>{formatRelative(p.created_at)}</span>
                  </div>
                </div>
                <div className="tabular w-36 text-sm font-semibold text-ink-2">{formatMoney(p.price, p.currency)}</div>
                <div className="tabular flex w-14 items-center gap-1 text-xs text-muted" title="بازدید">
                  <Eye aria-hidden className="h-3.5 w-3.5" />
                  {formatNumber(p.view_count ?? 0)}
                </div>
                <StatusActions listing={p} change={change} busy={isPending(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
