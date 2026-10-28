'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, ExternalLink, ImageOff, Inbox, ShieldAlert, Zap } from 'lucide-react';
import type { AdminTransactionItem } from '@bongah/shared-types';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber, formatPhone } from '@/lib/format';
import { useAdminPayments, useMe } from '@/hooks/use-api';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describePayment } from '@/components/subscription/payments-table';

const MIN_REASON = 3;

/**
 * The admin's side of manual payments: the queue of payments customers made by hand, with the picture of the receipt
 * each one sent. The admin looks at the picture and approves (the order is delivered exactly as a gateway payment would
 * be), refuses with a reason the customer will see, or, when there is no picture, activates it anyway with a reason
 * that goes to the audit log. Every decision is made by the API; this page only asks.
 */
export function PaymentsReview() {
  const t = useT();
  const { data: me, error: meError } = useMe();
  const [waiting, setWaiting] = useState(true);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminTransactionItem | null>(null);

  // The search waits for a pause in typing, and a new search or tab starts on the first page.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [q, waiting]);

  const isAdmin = me?.role === 'ADMIN';
  const list = useAdminPayments({ waiting, q, page });

  if (!me && !meError) return <Skeleton className="mx-auto h-72 max-w-5xl rounded-2xl" />;
  if (!isAdmin) {
    return (
      <div role="alert" data-testid="admin-only" className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-danger/30 bg-danger-tint p-5 text-danger">
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-[14px] font-bold">{t('adm.pay.notAdmin')}</p>
      </div>
    );
  }

  const data = list.data;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink">{t('adm.pay.title')}</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted">{t('adm.pay.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={waiting ? 'waiting' : 'all'} onValueChange={(v) => setWaiting(v === 'waiting')}>
          <TabsList>
            <TabsTrigger value="waiting" count={waiting && data ? formatNumber(data.meta.total) : undefined}>
              {t('adm.pay.tab.waiting')}
            </TabsTrigger>
            <TabsTrigger value="all">{t('adm.pay.tab.all')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('adm.pay.search')}
          aria-label={t('adm.pay.search')}
          className="max-w-sm flex-1"
          data-testid="admin-pay-search"
        />
      </div>

      <Card className="p-5">
        {!data && !list.error ? (
          <TableRowsSkeleton rows={5} cols={5} />
        ) : list.error && !data ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.mutate()} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState compact icon={Inbox} title={waiting ? t('adm.pay.empty') : t('adm.pay.emptyAll')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-[13px]" data-testid="admin-pay-table">
                <thead>
                  <tr className="border-b border-line text-start text-xs text-muted">
                    <th className="py-2 pe-3 text-start font-semibold">{t('adm.pay.col.customer')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.for')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.amount')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.status')}</th>
                    <th className="py-2 pe-3 text-start font-semibold">{t('pay.col.date')}</th>
                    <th className="py-2 text-start font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.data.map((p) => (
                    <PaymentRow key={p.id} payment={p} onReview={() => setSelected(p)} />
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
                <span className="tabular">{t('pay.page', { page: formatNumber(page), total: formatNumber(data.meta.total_pages) })}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.total_pages} onClick={() => setPage((n) => n + 1)} className="gap-1">
                  {t('pay.next')}
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <ReviewDialog
        payment={selected}
        onClose={() => setSelected(null)}
        onDecided={() => {
          setSelected(null);
          void list.mutate();
        }}
      />
    </div>
  );
}

function PaymentRow({ payment: p, onReview }: { payment: AdminTransactionItem; onReview: () => void }) {
  const t = useT();
  const labels = useLabels();
  const manualWaiting = p.method === 'MANUAL' && p.status === 'PENDING';
  return (
    <tr>
      <td className="py-2.5 pe-3">
        <div className="font-semibold text-ink">{p.agency_name ?? p.user.full_name ?? '—'}</div>
        <div className="ltr tabular text-xs text-muted">{formatPhone(p.user.phone_number)}</div>
      </td>
      <td className="max-w-[14rem] truncate py-2.5 pe-3 text-ink-2">{describePayment(p, labels)}</td>
      <td className="tabular py-2.5 pe-3 font-semibold text-ink">{formatMoney(p.amount, p.currency)}</td>
      <td className="py-2.5 pe-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={p.status === 'SUCCESS' ? 'primary' : p.status === 'FAILED' ? 'danger' : 'gold'}>{labels.txStatus[p.status]}</Badge>
          {p.method === 'MANUAL' ? (
            <>
              {p.receipt_uploaded ? <Badge tone="info">{t('adm.pay.hasReceipt')}</Badge> : null}
              {p.reference ? <Badge tone="info">{t('adm.pay.hasReference')}</Badge> : null}
              {!p.receipt_uploaded && !p.reference ? <Badge tone="neutral">{t('adm.pay.noReceipt')}</Badge> : null}
            </>
          ) : (
            <Badge tone="neutral">{t('adm.pay.method.GATEWAY')}</Badge>
          )}
          {p.force_activated ? <Badge tone="gold">{t('adm.pay.forcedBadge')}</Badge> : null}
        </div>
      </td>
      <td className="tabular py-2.5 pe-3 text-xs text-muted">{formatDateTime(p.created_at)}</td>
      <td className="py-2.5 text-end">
        <Button size="sm" variant={manualWaiting ? 'primary' : 'secondary'} onClick={onReview} data-testid="admin-pay-review">
          {t('adm.pay.review')}
        </Button>
      </td>
    </tr>
  );
}

type Mode = 'view' | 'force' | 'reject';

function ReviewDialog({
  payment,
  onClose,
  onDecided,
}: {
  payment: AdminTransactionItem | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const t = useT();
  const labels = useLabels();
  const [mode, setMode] = useState<Mode>('view');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  // Every payment opens fresh: no leftover reason, no leftover form.
  useEffect(() => {
    setMode('view');
    setReason('');
    setImageFailed(false);
  }, [payment?.id]);

  if (!payment) return <Dialog open={false} onOpenChange={onClose} title={t('adm.pay.reviewTitle')} />;

  const waiting = payment.status === 'PENDING';
  // Approving means having looked at something: the receipt picture, or the transaction id to compare with the account.
  const hasProof = Boolean(payment.receipt_uploaded || payment.reference);
  const reasonOk = reason.trim().length >= MIN_REASON;
  const proofUrl = `/api/bongah/admin/transactions/${payment.id}/proof?v=${encodeURIComponent(payment.proof_uploaded_at ?? '')}`;

  async function decide(action: 'approve' | 'force-activate' | 'reject') {
    setBusy(action);
    try {
      await api.post(`admin/transactions/${payment!.id}/${action}`, action === 'approve' ? {} : { reason: reason.trim() });
      toast.success(action === 'approve' ? t('adm.pay.approved') : action === 'force-activate' ? t('adm.pay.forced') : t('adm.pay.rejectedDone'));
      onDecided();
    } catch (e) {
      toast.error(errorMessage(e));
      // Someone else decided first (a webhook, another admin): the list shows how it ended.
      if (e instanceof ApiError && e.code === 'PAYMENT_NOT_PENDING') onDecided();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('adm.pay.reviewTitle')}
      size="lg"
      footer={
        waiting && mode === 'view' ? (
          <>
            <Button variant="danger" onClick={() => setMode('reject')} disabled={busy !== null} data-testid="admin-pay-reject">
              {t('adm.pay.reject')}
            </Button>
            <Button variant="gold" className="gap-1.5" onClick={() => setMode('force')} disabled={busy !== null} data-testid="admin-pay-force">
              <Zap aria-hidden className="h-4 w-4" />
              {t('adm.pay.force')}
            </Button>
            <Button
              className="gap-1.5"
              loading={busy === 'approve'}
              // With neither a picture nor a transaction id there is nothing to check: the way forward is the forced activation.
              disabled={!hasProof || (busy !== null && busy !== 'approve')}
              title={hasProof ? undefined : t('adm.pay.noProofTitle')}
              onClick={() => void decide('approve')}
              data-testid="admin-pay-approve"
            >
              <Check aria-hidden className="h-4 w-4" />
              {payment.purpose === 'SUBSCRIPTION' ? t('adm.pay.approveVip') : t('adm.pay.approve')}
            </Button>
          </>
        ) : null
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">{t('adm.pay.receiptImage')}</p>
          {payment.receipt_uploaded && !imageFailed ? (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="group block">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the panel's own proxy, behind the admin's session */}
              <img
                src={proofUrl}
                alt={t('adm.pay.receiptImage')}
                onError={() => setImageFailed(true)}
                className="max-h-96 w-full rounded-xl border border-line bg-soft object-contain"
                data-testid="admin-pay-image"
              />
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:underline">
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                {t('adm.pay.openFull')}
              </span>
            </a>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-soft px-4 text-center text-[13px] text-muted">
              <ImageOff aria-hidden className="h-6 w-6" />
              {payment.receipt_uploaded ? t('adm.pay.loadFailed') : t('adm.pay.noImage')}
            </div>
          )}
        </div>

        <dl className="divide-y divide-line text-[13px]">
          {payment.reference ? (
            <Row
              label={t('adm.pay.reference')}
              value={
                <span className="block text-end">
                  <span className="ltr tabular block select-all break-all text-base font-extrabold" data-testid="admin-pay-reference">
                    {payment.reference}
                  </span>
                  {waiting ? <span className="mt-0.5 block text-xs font-normal text-muted">{t('adm.pay.referenceHint')}</span> : null}
                </span>
              }
            />
          ) : null}
          <Row label={t('adm.pay.col.customer')} value={payment.agency_name ?? payment.user.full_name ?? '—'} />
          <Row label="" value={<span className="ltr tabular">{formatPhone(payment.user.phone_number)}</span>} />
          <Row label={t('pay.col.for')} value={describePayment(payment, labels)} />
          <Row label={t('pay.col.amount')} value={<span className="tabular text-base font-extrabold">{formatMoney(payment.amount, payment.currency)}</span>} />
          <Row label={t('pay.col.date')} value={<span className="tabular">{formatDateTime(payment.created_at)}</span>} />
          <Row label={t('pay.col.status')} value={<Badge tone={payment.status === 'SUCCESS' ? 'primary' : payment.status === 'FAILED' ? 'danger' : 'gold'}>{labels.txStatus[payment.status]}</Badge>} />
          {payment.receipt_number ? <Row label={t('pay.receipt.number')} value={<span className="ltr tabular">{payment.receipt_number}</span>} /> : null}
          {payment.reviewed_by ? (
            <Row
              label={t('adm.pay.reviewedBy', { name: payment.reviewed_by.full_name ?? formatPhone(payment.reviewed_by.phone_number) })}
              value={payment.reviewed_at ? <span className="tabular">{formatDateTime(payment.reviewed_at)}</span> : '—'}
            />
          ) : null}
          {payment.review_note ? <Row label={t('adm.pay.reason')} value={payment.review_note} /> : null}
        </dl>
      </div>

      {waiting && mode !== 'view' ? (
        <div className="mt-5 space-y-3 rounded-xl border border-line p-4" data-testid="admin-pay-reason-box">
          <p className="text-[13px] leading-6 text-ink-2">{mode === 'force' ? t('adm.pay.forceText') : t('adm.pay.rejectText')}</p>
          <Field label={t('adm.pay.reason')} hint={t('adm.pay.reasonHint')}>
            {(props) => (
              <Textarea {...props} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="min-h-20" data-testid="admin-pay-reason" />
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode('view')} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={mode === 'force' ? 'gold' : 'danger'}
              loading={busy !== null}
              disabled={!reasonOk}
              onClick={() => void decide(mode === 'force' ? 'force-activate' : 'reject')}
              data-testid="admin-pay-confirm"
            >
              {mode === 'force' ? t('adm.pay.confirmForce') : t('adm.pay.confirmReject')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end font-semibold text-ink">{value}</dd>
    </div>
  );
}
