'use client';

import { useCallback, useEffect } from 'react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import type { PaymentStatus } from '@bongah/shared-types';
import { api } from '@/lib/api';
import { tNow } from '@/i18n/active';
import { forgetPayment, paymentDoneText, PENDING_PAYMENTS_KEY, readPending, type PendingPayment } from '@/lib/pending-payments';
import { useLocalStorage } from '@/hooks/use-local-storage';

const POLL_MS = 8_000;

/**
 * Renders nothing. Notices how the payments started in this browser ended. While any is still unconfirmed it asks the API every few
 * seconds (and when the tab regains focus, which is when someone comes back from the gateway), then says so and
 * refreshes everything the payment can change: the plan, the quota, the listings and the payments table.
 * A manual payment is watched from the moment its receipt is sent: it ends when an admin approves or refuses it.
 */
export function PaymentWatcher() {
  const [stored] = useLocalStorage<PendingPayment[]>(PENDING_PAYMENTS_KEY, []);
  const count = Array.isArray(stored) ? stored.length : 0;

  const check = useCallback(async () => {
    const list = readPending();
    if (list.length === 0) return;
    let changed = false;
    await Promise.all(
      list.map(async (p) => {
        try {
          const payment = await api.get<PaymentStatus>(`hesabpay/payments/${encodeURIComponent(p.id)}`);
          if (payment.status === 'SUCCESS') {
            forgetPayment(p.id);
            toast.success(paymentDoneText(p.purpose));
            changed = true;
          } else if (payment.status === 'FAILED') {
            forgetPayment(p.id);
            // A payment an admin refused comes with the reason; any other failure has no more to say than that.
            toast.error(payment.review_note ? tNow('pm.rejected', { reason: payment.review_note }) : tNow('payment.failed'));
            changed = true;
          }
        } catch {
          /* offline or a hiccup: the next round asks again */
        }
      }),
    );
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

  // No banner: a payment is made by hand (HesabPay or card, receipt sent in the payment dialog) and the payments
  // table already says "under review". This only watches, and says how it ended with a toast.
  return null;
}
