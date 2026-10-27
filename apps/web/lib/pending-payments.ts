import type { TransactionPurpose } from '@bongah/shared-types';
import { tNow } from '@/i18n/active';
import type { MessageKey } from '@/i18n/translate';
import { readStored, writeStored } from '@/hooks/use-local-storage';

/**
 * A payment is made on the gateway's own page, so the panel is left and (hopefully) come back to later. The panel
 * therefore writes down each payment it starts; when the person is back it asks the API how each one ended, tells them,
 * and refreshes the plan, quota and listings. This is the whole of the "return from the gateway" handling: the API's
 * own webhook is what actually credits the account, so nothing here can grant anything, it only notices.
 */
export const PENDING_PAYMENTS_KEY = 'bongah.pendingPayments';
/** A payment older than this is not watched any more (it can still be found in the payments table). */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_KEPT = 8;

export interface PendingPayment {
  id: string;
  purpose: TransactionPurpose;
  startedAt: number;
}

/** Drops what is too old or malformed. */
export function livePending(list: unknown, now = Date.now()): PendingPayment[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is PendingPayment =>
      Boolean(p) &&
      typeof p.id === 'string' &&
      typeof p.purpose === 'string' &&
      typeof p.startedAt === 'number' &&
      now - p.startedAt < PENDING_MAX_AGE_MS,
  );
}

export function readPending(now = Date.now()): PendingPayment[] {
  return livePending(readStored<unknown>(PENDING_PAYMENTS_KEY), now);
}

export function rememberPayment(payment: { id: string; purpose: TransactionPurpose }, now = Date.now()) {
  const rest = readPending(now).filter((p) => p.id !== payment.id);
  writeStored(PENDING_PAYMENTS_KEY, [...rest, { ...payment, startedAt: now }].slice(-MAX_KEPT));
}

export function forgetPayment(id: string, now = Date.now()) {
  const rest = readPending(now).filter((p) => p.id !== id);
  writeStored(PENDING_PAYMENTS_KEY, rest.length ? rest : null);
}

const DONE_KEYS: Partial<Record<TransactionPurpose, MessageKey>> = {
  SUBSCRIPTION: 'payment.done.SUBSCRIPTION',
  LADDER: 'payment.done.LADDER',
  FEATURED_CREDITS: 'payment.done.FEATURED_CREDITS',
  FEATURED_AD: 'payment.done.FEATURED_AD',
};

/** What to tell the person once this kind of payment went through, in the language shown now. */
export const paymentDoneText = (purpose: TransactionPurpose) => tNow(DONE_KEYS[purpose] ?? 'payment.done.other');
