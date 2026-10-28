import type { PaymentInitiated, SubscriptionPackage, TransactionPurpose } from '@bongah/shared-types';
import { mutate } from 'swr';
import { toast } from 'sonner';
import { api } from './api';
import { openManualPayment } from './manual-payment';
import { paymentDoneText, rememberPayment } from './pending-payments';
import { tNow } from '@/i18n/active';

export type PaymentRequest =
  | { purpose: 'SUBSCRIPTION'; package_type: SubscriptionPackage }
  | { purpose: 'LADDER'; property_id: string }
  | { purpose: 'FEATURED_CREDITS'; bundle_size: 1 | 3 | 5 | 10 | 20 };

/**
 * How a started payment went on:
 * - `redirected`: the browser is being sent to the gateway's page (the page is about to be left).
 * - `completed`: the API settled it on the spot (the test gateway with auto-success on): the account is already
 *   updated and the panel stays where it is.
 * - `manual`: there is no gateway page (manual mode): the "pay by hand" dialog opens over the panel, which stays where
 *   it is, and the payment is confirmed later by an admin.
 */
export type PaymentOutcome = 'redirected' | 'completed' | 'manual';

/** Only a plain web address is followed: whatever else the server might send is refused, not opened. */
export function safePaymentUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Starts a payment (the server sets the price). When the API already settled it, nothing more happens here; otherwise
 * the browser is sent to the gateway's page.
 */
export async function startPayment(request: PaymentRequest): Promise<PaymentOutcome> {
  const payment = await api.post<PaymentInitiated>('hesabpay/payments', request);
  // The test gateway can settle at once. The API did the crediting; there is no page to go to and nothing to wait for.
  if (payment.status === 'SUCCESS') return 'completed';
  // Manual mode: no page to go to. Show where to send the money; the dialog reads the rest from the API (seeded now,
  // so it opens with the amount and the accounts without waiting for another round trip).
  if (payment.method === 'MANUAL' || payment.payment_url === null) {
    await mutate(`hesabpay/payments/${payment.id}`, payment, { revalidate: false });
    openManualPayment(payment.id);
    return 'manual';
  }
  const url = safePaymentUrl(payment.payment_url);
  if (!url) throw new Error(tNow('payment.badUrl'));
  // Written down before leaving, so the panel can tell how it ended when the person is back (see pending-payments.ts).
  rememberPayment({ id: payment.id, purpose: payment.purpose });
  window.location.assign(url);
  return 'redirected';
}

/** Whether a payment is one that waits for a person (the customer's receipt, then an admin), not for the gateway. */
export const isManual = (payment: { method?: string }): boolean => payment.method === 'MANUAL';

/** After a payment that completed in place: say what was bought and refresh the plan, quota, credits and listings. */
export async function announcePaid(purpose: TransactionPurpose): Promise<void> {
  toast.success(paymentDoneText(purpose));
  await mutate(() => true);
}
