'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, Printer, Receipt as ReceiptIcon } from 'lucide-react';
import type { PaymentSummary, Receipt } from '@bongah/shared-types';
import { errorMessage, fetcher } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { PLAN_LABEL, PURPOSE_LABEL, TX_STATUS_LABEL } from '@/lib/labels';
import { usePayments } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';

const TONE = { SUCCESS: 'primary', PENDING: 'gold', FAILED: 'danger' } as const;

function describe(p: PaymentSummary): string {
  const base = PURPOSE_LABEL[p.purpose];
  if (p.purpose === 'SUBSCRIPTION' && p.package_type) return `${base} ${PLAN_LABEL[p.package_type]}`;
  if (p.property_title) return `${base} · ${p.property_title}`;
  if (p.quantity && p.purpose === 'FEATURED_CREDITS') return `${base} (${formatNumber(p.quantity)})`;
  return base;
}

export function PaymentsTable() {
  const [page, setPage] = useState(1);
  const { data, error, mutate } = usePayments(page);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader title="تاریخچهٔ پرداخت‌ها" description="پرداخت‌های در انتظار بعد از تأیید حساب‌پی خودکار به‌روز می‌شوند." />
      <div className="p-5 pt-3">
        {!data && !error ? (
          <TableRowsSkeleton rows={4} cols={4} />
        ) : error && !data ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState compact icon={ReceiptIcon} title="هنوز پرداختی ندارید" description="اشتراک و بسته‌هایی که می‌خرید اینجا با رسید دیده می‌شود." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">برای</th>
                    <th className="py-2 pe-3 text-start font-semibold">مبلغ</th>
                    <th className="py-2 pe-3 text-start font-semibold">وضعیت</th>
                    <th className="py-2 pe-3 text-start font-semibold">تاریخ</th>
                    <th className="py-2 text-start font-semibold">رسید</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[16rem] truncate py-2.5 pe-3 font-semibold text-ink">{describe(p)}</td>
                      <td className="tabular py-2.5 pe-3 text-ink-2">{formatMoney(p.amount, p.currency)}</td>
                      <td className="py-2.5 pe-3">
                        <Badge tone={TONE[p.status]}>{TX_STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td className="tabular py-2.5 pe-3 text-xs text-muted">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                      <td className="py-2.5">
                        {p.receipt_number ? (
                          <Button size="sm" variant="ghost" onClick={() => setReceiptFor(p.id)} className="gap-1.5">
                            <ReceiptIcon aria-hidden className="h-3.5 w-3.5" />
                            رسید
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.meta.total_pages > 1 ? (
              <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="gap-1">
                  <ChevronRight aria-hidden className="h-4 w-4" />
                  قبلی
                </Button>
                <span className="tabular">
                  {formatNumber(page)} از {formatNumber(data.meta.total_pages)}
                </span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.total_pages} onClick={() => setPage((n) => n + 1)} className="gap-1">
                  بعدی
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <ReceiptDialog id={receiptFor} onClose={() => setReceiptFor(null)} />
    </Card>
  );
}

function ReceiptDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, error } = useSWR<Receipt>(id ? `hesabpay/payments/${id}/receipt` : null, fetcher);
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title="رسید پرداخت"
      size="sm"
      footer={
        data ? (
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer aria-hidden className="h-4 w-4" />
            چاپ
          </Button>
        ) : null
      }
    >
      {error ? (
        <p className="py-6 text-center text-[13px] text-danger">{errorMessage(error)}</p>
      ) : !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <dl className="divide-y divide-line text-[13px]">
          <Row label="شمارهٔ رسید" value={<span className="ltr tabular">{data.receipt_number}</span>} />
          <Row label="برای" value={PURPOSE_LABEL[data.purpose] + (data.package_type ? ` ${PLAN_LABEL[data.package_type]}` : '')} />
          {data.property ? <Row label="آگهی" value={data.property.title} /> : null}
          <Row label="مبلغ" value={<span className="tabular font-bold">{formatMoney(data.amount, data.currency)}</span>} />
          <Row label="تاریخ" value={<span className="tabular">{formatDateTime(data.issued_at)}</span>} />
          <Row label="پرداخت‌کننده" value={data.payer.agency_name ?? data.payer.full_name ?? '—'} />
          <Row label="مرجع حساب‌پی" value={<span className="ltr tabular break-all">{data.reference}</span>} />
        </dl>
      )}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-semibold text-ink">{value}</dd>
    </div>
  );
}
