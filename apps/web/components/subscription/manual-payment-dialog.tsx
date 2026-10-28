'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'sonner';
import { Check, Copy, Hash, ImagePlus, Landmark, Smartphone } from 'lucide-react';
import type { ManualPaymentAccount, PaymentStatus } from '@bongah/shared-types';
import { api, errorMessage, fetcher } from '@/lib/api';
import { formatMoney, toAsciiDigits } from '@/lib/format';
import { fitImage, IMAGE_ACCEPT, isAcceptedImage } from '@/lib/image';
import { closeManualPayment, useOpenManualPayment } from '@/lib/manual-payment';
import { rememberPayment } from '@/lib/pending-payments';
import { useT } from '@/i18n/provider';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';

/** The transaction id as typed on a receipt: letters and digits, with a few separators inside (same rule as the API). */
const REFERENCE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 ._/-]*[A-Za-z0-9])?$/;

export function cleanReference(text: string): string {
  return toAsciiDigits(text).replace(/\s+/g, ' ').trim();
}

export function isValidReference(text: string): boolean {
  const value = cleanReference(text);
  return value.length >= 4 && value.length <= 64 && REFERENCE_PATTERN.test(value);
}

/**
 * "Pay by hand": opens when a payment is started in manual mode, and again from the payments table for a payment that
 * still waits for its receipt. It shows what to pay and where (the accounts come from the API, set by the operator,
 * never typed in here), and takes proof of the transfer: the picture of the receipt, the transaction id printed on it,
 * or both. Nothing here can activate anything: an admin looks at the proof and confirms (see the admin payments page).
 */
export function ManualPaymentDialog() {
  const id = useOpenManualPayment();
  const t = useT();
  const key = id ? `hesabpay/payments/${id}` : null;
  const { data: payment, error } = useSWR<PaymentStatus>(key, fetcher);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState('');
  const [refProblem, setRefProblem] = useState<string | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const [editRef, setEditRef] = useState(false);

  // A new payment starts with no picture chosen and nothing typed.
  useEffect(() => {
    setFile(null);
    setProblem(null);
    setReference('');
    setRefProblem(null);
    setEditRef(false);
  }, [id]);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(chosen: File | undefined) {
    setProblem(null);
    if (!chosen) return;
    if (!isAcceptedImage(chosen)) {
      setProblem(t('pm.receipt.badType'));
      return;
    }
    setFile(chosen);
  }

  async function send() {
    if (!id || !file) return;
    setSending(true);
    setProblem(null);
    try {
      const ready = await fitImage(file);
      const updated = await api.upload<PaymentStatus>(`hesabpay/payments/${id}/proof`, ready);
      await mutate(`hesabpay/payments/${id}`, updated, { revalidate: false });
      // From here the panel watches the payment, and says so when an admin has decided.
      rememberPayment({ id, purpose: updated.purpose, manual: true });
      await mutate((k) => typeof k === 'string' && k.startsWith('hesabpay/payments?'));
      setFile(null);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function sendReference() {
    if (!id) return;
    if (!isValidReference(reference)) {
      setRefProblem(t('pm.ref.invalid'));
      return;
    }
    setRefBusy(true);
    setRefProblem(null);
    try {
      const updated = await api.post<PaymentStatus>(`hesabpay/payments/${id}/reference`, { reference: cleanReference(reference) });
      await mutate(`hesabpay/payments/${id}`, updated, { revalidate: false });
      rememberPayment({ id, purpose: updated.purpose, manual: true });
      await mutate((k) => typeof k === 'string' && k.startsWith('hesabpay/payments?'));
      setReference('');
      setEditRef(false);
    } catch (e) {
      setRefProblem(errorMessage(e));
    } finally {
      setRefBusy(false);
    }
  }

  const waiting = payment?.status === 'PENDING';
  const pictureSent = !!payment?.receipt_uploaded && !file;
  const referenceSent = !!payment?.reference && !editRef;
  const sent = pictureSent || referenceSent;

  return (
    <Dialog
      open={!!id}
      onOpenChange={(open) => !open && closeManualPayment()}
      title={t('pm.title')}
      description={waiting || !payment ? t('pm.intro') : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={closeManualPayment}>
            {sent ? t('common.close') : t('pm.later')}
          </Button>
          {file ? (
            <Button loading={sending} onClick={() => void send()} data-testid="manual-send">
              {t('pm.receipt.send')}
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <p className="py-6 text-center text-[13px] text-danger">{errorMessage(error)}</p>
      ) : !payment ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl bg-primary-tint/50 p-4 text-center">
            <p className="text-xs font-semibold text-muted">{t('pm.amount')}</p>
            <p className="tabular mt-1 text-2xl font-extrabold text-ink" data-testid="manual-amount">
              {formatMoney(payment.amount, payment.currency)}
            </p>
          </div>

          {waiting ? (
            <>
              <ul className="space-y-3" data-testid="manual-accounts">
                {(payment.manual?.accounts ?? []).map((account) => (
                  <AccountRow key={`${account.kind}:${account.number}`} account={account} />
                ))}
              </ul>
              {payment.manual?.note ? <p className="rounded-lg bg-soft px-3 py-2 text-[13px] leading-6 text-ink-2">{payment.manual.note}</p> : null}
              <ol className="list-inside list-decimal space-y-1 text-[13px] leading-6 text-ink-2">
                <li>{t('pm.steps.1')}</li>
                <li>{t('pm.steps.2')}</li>
                <li>{t('pm.steps.3')}</li>
              </ol>

              {sent ? (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-tint p-4 text-primary-dark" data-testid="manual-sent">
                  <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-extrabold">{pictureSent ? t('pm.receipt.sentTitle') : t('pm.ref.sentTitle')}</p>
                    <p className="mt-1 text-[13px] leading-6">{t('pm.receipt.sentText')}</p>
                    {referenceSent ? (
                      <p className="ltr tabular mt-2 select-all break-all text-[13px] font-bold" data-testid="manual-reference-saved">
                        {payment.reference}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pictureSent ? (
                        <Button size="sm" variant="secondary" onClick={() => input.current?.click()}>
                          {t('pm.receipt.replace')}
                        </Button>
                      ) : null}
                      {referenceSent ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditRef(true)}>
                          {t('pm.ref.change')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {!pictureSent ? (
                <div className="space-y-3">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the chosen file
                    <img src={preview} alt="" className="mx-auto max-h-64 rounded-xl border border-line object-contain" data-testid="manual-preview" />
                  ) : null}
                  <Button variant="secondary" className="w-full justify-center" onClick={() => input.current?.click()}>
                    <ImagePlus aria-hidden className="h-4 w-4" />
                    {file ? t('pm.receipt.change') : t('pm.receipt.choose')}
                  </Button>
                  <p className="text-center text-xs text-muted">{t('pm.receipt.hint')}</p>
                </div>
              ) : null}

              {!referenceSent ? (
                <>
                  {!pictureSent ? (
                    <div className="flex items-center gap-3 text-xs font-semibold text-muted" aria-hidden>
                      <span className="h-px flex-1 bg-line" />
                      {t('pm.or')}
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <div className="space-y-2" data-testid="manual-reference-box">
                    <label htmlFor="manual-reference" className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <Hash aria-hidden className="h-4 w-4 text-primary" />
                      {t('pm.ref.title')}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-reference"
                        dir="ltr"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={64}
                        value={reference}
                        invalid={!!refProblem}
                        placeholder={t('pm.ref.placeholder')}
                        aria-label={t('pm.ref.label')}
                        onChange={(e) => {
                          setReference(e.target.value);
                          setRefProblem(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void sendReference();
                          }
                        }}
                        className="tabular flex-1 text-start"
                        data-testid="manual-reference"
                      />
                      <Button variant="secondary" loading={refBusy} disabled={reference.trim().length === 0} onClick={() => void sendReference()} data-testid="manual-reference-send">
                        {t('pm.ref.send')}
                      </Button>
                    </div>
                    <p className="text-xs leading-5 text-muted">{t('pm.ref.hint')}</p>
                    {refProblem ? (
                      <p role="alert" className="text-[13px] font-semibold text-danger" data-testid="manual-reference-problem">
                        {refProblem}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
              <input
                ref={input}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                data-testid="manual-file"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = ''; // choosing the same file again must still fire
                }}
              />
              {problem ? (
                <p role="alert" className="text-[13px] font-semibold text-danger">
                  {problem}
                </p>
              ) : null}
            </>
          ) : (
            <p role="status" className="text-center text-[13px] font-semibold text-ink-2">
              {payment.status === 'SUCCESS'
                ? t('payment.done.other')
                : payment.review_note
                  ? t('pm.rejected', { reason: payment.review_note })
                  : t('payment.failed')}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function AccountRow({ account }: { account: ManualPaymentAccount }) {
  const t = useT();
  const Icon = account.kind === 'CARD' ? Landmark : Smartphone;

  async function copy() {
    try {
      await navigator.clipboard.writeText(account.number.replace(/\s+/g, ''));
      toast.success(t('pm.copied'));
    } catch {
      /* the number is on screen and selectable; copying is a convenience */
    }
  }

  return (
    <li className="rounded-xl border border-line p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
        <Icon aria-hidden className="h-4 w-4 text-primary" />
        {t(`pm.account.${account.kind}`)}
        {account.bank ? <span className="font-normal text-muted">· {account.bank}</span> : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{t(`pm.number.${account.kind}`)}</p>
          <p className="ltr tabular select-all break-all text-lg font-extrabold tracking-wide text-ink">{account.number}</p>
        </div>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void copy()}>
          <Copy aria-hidden className="h-3.5 w-3.5" />
          {t('pm.copy')}
        </Button>
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">
        {t('pm.holder')} <span className="font-bold text-ink">{account.holder}</span>
      </p>
    </li>
  );
}
