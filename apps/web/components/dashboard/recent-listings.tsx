'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { FilePlus2, Eye } from 'lucide-react';
import type { Paginated, Property } from '@bongah/shared-types';
import { fetcher } from '@/lib/api';
import { formatNumber, formatRelative } from '@/lib/format';
import { useLabels } from '@/i18n/use-labels';
import { useLanguage, useT } from '@/i18n/provider';
import { provinceNameLabel } from '@/lib/provinces';
import { SYNC_INTERVAL_MS } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { StatusActions, useStatusChange } from '@/components/listings/status-toggle';
import { PriceTermsTag } from '@/components/listings/price-terms-tag';
import { listingPrice } from '@/lib/price';

const KEY = 'properties/mine?status=ACTIVE&sort=newest&limit=8';

export function RecentListings() {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const { data, error, mutate } = useSWR<Paginated<Property>>(KEY, fetcher, {
    refreshInterval: SYNC_INTERVAL_MS,
    keepPreviousData: true,
  });
  const { change, isPending } = useStatusChange();

  return (
    <Card>
      <CardHeader
        title={t('dash.recent.title')}
        description={t('dash.recent.desc')}
        action={
          <Link href="/dashboard/listings" className="text-[13px] font-semibold text-primary hover:underline">
            {t('dash.recent.all')}
          </Link>
        }
      />
      <div className="mt-3">
        {!data && !error ? (
          <TableRowsSkeleton rows={5} cols={5} />
        ) : error && !data ? (
          <ErrorState message={t('dash.recent.error')} onRetry={() => void mutate()} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title={t('dash.recent.emptyTitle')}
            description={t('dash.recent.emptyText')}
            action={
              <Link href="/dashboard/listings/quick-add">
                <Button>{t('dash.recent.new')}</Button>
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
                      {labels.deal[p.deal_type]}
                    </Badge>
                    <span>{labels.type[p.type]}</span>
                    <span>·</span>
                    <span>{p.district || provinceNameLabel(p.province, language)}</span>
                    <span>·</span>
                    <span>{formatRelative(p.created_at)}</span>
                  </div>
                </div>
                <div className="flex w-36 flex-col items-start gap-0.5">
                  <span className="tabular text-sm font-semibold text-ink-2">{listingPrice(p)}</span>
                  <PriceTermsTag terms={p.price_terms} market={p.market} />
                </div>
                <div className="tabular flex w-14 items-center gap-1 text-xs text-muted" title={t('dash.recent.views')}>
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
