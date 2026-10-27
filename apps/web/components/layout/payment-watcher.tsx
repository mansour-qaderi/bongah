'use client';

import { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import type { PaymentSummary } from '@bongah/shared-types';
import { api } from '@/lib/api';
import { tNow } from '@/i18n/active';
import { useT } from '@/i18n/provider';
import { forgetPayment, paymentDoneText, PENDING_PAYMENTS_KEY, readPending, type PendingPayment } from '@/lib/pending-payments';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { LoadingDots } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';

const POLL_MS = 8_000;

/**
 * Notices how the payments started in this browser ended. While any is still unconfirmed it asks the API every few
 * seconds (and when the tab regains focus, which is when someone comes back from the gateway), then says so and
 * refreshes everything the payment can change: the plan, the quota, the listings and the payments table.
 */
export function PaymentWatcher() {
  const t = useT();
  const [stored] = useLocalStorage<PendingPayment[]>(PENDING_PAYMENTS_KEY, []);
  const [checking, setChecking] = useState(false);
  const count = Array.isArray(stored) ? stored.length : 0;

  const check = useCallback(async () => {
    const list = readPending();
    if (list.length === 0) return;
    setChecking(true);
    let changed = false;
    await Promise.all(
      list.map(async (p) => {
        try {
          const payment = await api.get<PaymentSummary>(`hesabpay/payments/${encodeURIComponent(p.id)}`);
          if (payment.status === 'SUCCESS') {
            forgetPayment(p.id);
            toast.success(paymentDoneText(p.purpose));
            changed = true;
          } else if (payment.status === 'FAILED') {
            forgetPayment(p.id);
            toast.error(tNow('payment.failed'));
            changed = true;
          }
        } catch {
          /* offline or a hiccup: the next round asks again */
        }
      }),
    );
    setChecking(false);
    if (changed) await mutate(() => true);
  }, []);

  useEffect(() => {
    if (count === 0) return;
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [count, check]);

  if (count === 0) return null;
  return (
    <div
      role="status"
      data-testid="payment-watcher"
      className="reveal fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2"
    >
      <span className="text-primary">
        <LoadingDots />
      </span>
      <span className="min-w-0 flex-1">{t('payment.checking')}</span>
      <Button size="sm" variant="secondary" onClick={() => void check()} disabled={checking}>
        {t('payment.check')}
      </Button>
    </div>
  );
}
