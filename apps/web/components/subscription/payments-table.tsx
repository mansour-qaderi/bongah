'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, ImagePlus, Printer, Receipt as ReceiptIcon } from 'lucide-react';
import type { PaymentSummary, Receipt } from '@bongah/shared-types';
import { errorMessage, fetcher } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import type { Labels } from '@/lib/labels';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { openManualPayment } from '@/lib/manual-payment';
import { usePayments } from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';

const TONE = { SUCCESS: 'primary', PENDING: 'gold', FAILED: 'danger' } as const;

/** The status, with what a payment made by hand is waiting for (the customer's receipt, then an admin) or why it was refused. */
function StatusCell({ payment }: { payment: PaymentSummary }) {
  const t = useT();
  const labels = useLabels();
  if (payment.method === 'MANUAL' && payment.status === 'PENDING') {
    return payment.receipt_uploaded || payment.reference ? (
      <Badge tone="info">{t('pm.status.review')}</Badge>
    ) : (
      <Badge tone="gold">{t('pm.status.needReceipt')}</Badge>
    );
  }
  return (
    <>
      <Badge tone={TONE[payment.status]}>{labels.txStatus[payment.status]}</Badge>
      {payment.status === 'FAILED' && payment.review_note ? (
        <p className="mt-1 max-w-[14rem] text-xs leading-5 text-muted">{t('pm.reasonNote', { reason: payment.review_note })}</p>
      ) : null}
    </>
  );
}

export function describePayment(p: PaymentSummary, labels: Labels): string {
  const base = labels.purpose[p.purpose];
  if (p.purpose === 'SUBSCRIPTION' && p.package_type) return `${base} ${labels.plan[p.package_type]}`;
  if (p.property_title) return `${base} · ${p.property_title}`;
  if (p.quantity && p.purpose === 'FEATURED_CREDITS') return `${base} (${formatNumber(p.quantity)})`;
  return base;
}

export function PaymentsTable() {
  const t = useT();
  const labels = useLabels();
  const [page, setPage] = useState(1);
  const { data, error, mutate } = usePayments(page);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader title={t('pay.title')} description={t('pay.desc')} />
      <div className="p-5 pt-3">
        {!data && !error ? (
          <TableRowsSkeleton rows={4} cols={4} />
        ) : error && !data ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState compact icon={ReceiptIcon} title={t('pay.emptyTitle')} description={t('pay.emptyText')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.for')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.amount')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.status')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.date')}</th>
                    <th className="py-2 text-start font-semibold">{t('pay.col.receipt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[16rem] truncate py-2.5 pe-3 font-semibold text-ink">{describePayment(p, labels)}</td>
                      <td className="tabular py-2.5 pe-3 text-ink-2">{formatMoney(p.amount, p.currency)}</td>
                      <td className="py-2.5 pe-3">
                        <StatusCell payment={p} />
                      </td>
                      <td className="tabular py-2.5 pe-3 text-xs text-muted">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                      <td className="py-2.5">
                        {p.receipt_number ? (
                          <Button size="sm" variant="ghost" onClick={() => setReceiptFor(p.id)} className="gap-1.5">
                            <ReceiptIcon aria-hidden className="h-3.5 w-3.5" />
                            {t('pay.col.receipt')}
                          </Button>
                        ) : p.method === 'MANUAL' && p.status === 'PENDING' ? (
                          // Paid by hand and not yet decided: this is where a receipt is sent, or sent again.
                          <Button size="sm" variant="secondary" onClick={() => openManualPayment(p.id)} className="gap-1.5" data-testid="pay-upload">
                            <ImagePlus aria-hidden className="h-3.5 w-3.5" />
                            {t('pm.action.upload')}
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
                  {t('pay.prev')}
                </Button>
                <span className="tabular">
                  {t('pay.page', { page: formatNumber(page), total: formatNumber(data.meta.total_pages) })}
                </span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.total_pages} onClick={() => setPage((n) => n + 1)} className="gap-1">
                  {t('pay.next')}
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
  const t = useT();
  const labels = useLabels();
  const { data, error } = useSWR<Receipt>(id ? `hesabpay/payments/${id}/receipt` : null, fetcher);
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={t('pay.receipt.title')}
      size="sm"
      footer={
        data ? (
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer aria-hidden className="h-4 w-4" />
            {t('pay.receipt.print')}
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
          <Row label={t('pay.receipt.number')} value={<span className="ltr tabular">{data.receipt_number}</span>} />
          <Row label={t('pay.col.for')} value={labels.purpose[data.purpose] + (data.package_type ? ` ${labels.plan[data.package_type]}` : '')} />
          {data.property ? <Row label={t('pay.receipt.listing')} value={data.property.title} /> : null}
          <Row label={t('pay.col.amount')} value={<span className="tabular font-bold">{formatMoney(data.amount, data.currency)}</span>} />
          <Row label={t('pay.col.date')} value={<span className="tabular">{formatDateTime(data.issued_at)}</span>} />
          <Row label={t('pay.receipt.payer')} value={data.payer.agency_name ?? data.payer.full_name ?? '—'} />
          <Row label={t('pay.receipt.reference')} value={<span className="ltr tabular break-all">{data.reference}</span>} />
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
