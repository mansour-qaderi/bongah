'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/provider';

/** A shimmering placeholder block. Size it with className (h-4 w-24 …). */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} {...rest} />;
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="mt-5 h-8 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}

export function TableRowsSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  const t = useT();
  return (
    <div role="status" aria-label={t('common.loadingList')} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          {Array.from({ length: Math.max(0, cols - 3) }, (_, c) => (
            <Skeleton key={c} className="hidden h-4 w-20 md:block" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div aria-hidden className="flex items-end gap-2 px-2" style={{ height }}>
      {[40, 65, 50, 80, 55, 90, 70, 60, 85, 45, 75, 95].map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  const t = useT();
  return (
    <div role="status" aria-label={t('common.loading')} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
