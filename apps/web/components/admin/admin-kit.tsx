'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import useSWR from 'swr';
import type { AdminPerson, Paginated } from '@bongah/shared-types';
import { fetcher } from '@/lib/api';
import { formatNumber, formatPhone } from '@/lib/format';
import { useMe } from '@/hooks/use-api';
import { useT } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';

export const ADMIN_PAGE_SIZE = 20;
/** The shortest reason the API accepts for a ban, a removal or a refusal. */
export const MIN_REASON = 3;

/** A value that follows `value` after the typing rests: one search per pause, not per key. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * One admin list: `path` plus its filters as the query string. Empty filters are left out. The list re-reads on a timer
 * (an admin looks at it while customers act) and keeps the old rows on screen while the next page loads.
 */
export function useAdminList<T>(path: string, params: Record<string, string | number | boolean | undefined | null>, page: number) {
  const qs = new URLSearchParams({ page: String(page), limit: String(ADMIN_PAGE_SIZE) });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    qs.set(key, String(value));
  }
  return useSWR<Paginated<T>>(`${path}?${qs}`, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2_000,
  });
}

/** Everything under /dashboard/admin is for an admin account; anyone else is told so (the API refuses them regardless). */
export function AdminGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const { data: me, error } = useMe();
  if (!me && !error) return <Skeleton className="mx-auto h-72 max-w-5xl rounded-2xl" />;
  if (me?.role !== 'ADMIN') {
    return (
      <div role="alert" data-testid="admin-only" className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-danger/30 bg-danger-tint p-5 text-danger">
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-[14px] font-bold">{t('adm.notAdmin')}</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** The title and the one-line explanation at the top of an admin page, then the page. */
export function AdminPage({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <AdminGuard>
      <div className={wide ? 'mx-auto max-w-7xl space-y-5' : 'mx-auto max-w-6xl space-y-5'}>
        <div>
          <h1 className="text-xl font-extrabold text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </AdminGuard>
  );
}

export function SearchBox({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="max-w-sm flex-1"
      data-testid={testId ?? 'admin-search'}
    />
  );
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const t = useT();
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} className="gap-1">
        <ChevronRight aria-hidden className="h-4 w-4" />
        {t('pay.prev')}
      </Button>
      <span className="tabular">{t('pay.page', { page: formatNumber(page), total: formatNumber(totalPages) })}</span>
      <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="gap-1">
        {t('pay.next')}
        <ChevronLeft aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** A person as a table cell: the name over the phone number. */
export function PersonCell({ person, extra }: { person: Pick<AdminPerson, 'full_name' | 'phone_number'>; extra?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold text-ink">{person.full_name ?? '—'}</div>
      <div className="ltr tabular text-xs text-muted">{formatPhone(person.phone_number)}</div>
      {extra}
    </div>
  );
}

/** A dialog that asks for a reason (at least three characters) before something is done, and hands it to `onSubmit`. */
export function ReasonDialog({
  open,
  title,
  text,
  confirmLabel,
  tone = 'danger',
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const ok = reason.trim().length >= MIN_REASON;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title={title}
      description={text}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={!ok} onClick={() => onSubmit(reason.trim())} data-testid="admin-reason-confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={t('adm.reasonLabel')} hint={t('adm.reasonHint')}>
        {(props) => <Textarea {...props} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} className="min-h-20" data-testid="admin-reason" />}
      </Field>
    </Dialog>
  );
}
