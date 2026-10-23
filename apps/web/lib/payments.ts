import type { PaymentInitiated, SubscriptionPackage } from '@bongah/shared-types';
import { api } from './api';

export type PaymentRequest =
  | { purpose: 'SUBSCRIPTION'; package_type: SubscriptionPackage }
  | { purpose: 'LADDER'; property_id: string }
  | { purpose: 'FEATURED_CREDITS'; bundle_size: 1 | 3 | 5 | 10 | 20 };

/** Only a plain web address is followed: whatever else the server might send is refused, not opened. */
export function safePaymentUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Starts a payment (the server sets the price) and sends the browser to the gateway's page. */
export async function startPayment(request: PaymentRequest): Promise<void> {
  const payment = await api.post<PaymentInitiated>('hesabpay/payments', request);
  const url = safePaymentUrl(payment.payment_url);
  if (!url) throw new Error('آدرس پرداخت نامعتبر است. دوباره تلاش کنید.');
  window.location.assign(url);
}
