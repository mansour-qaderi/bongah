import type { SubscriptionPackage } from '../generated/prisma/client.js';

/** Header carrying the HMAC of the raw body on webhooks (mock gateway; the live provider defines its own). */
export const WEBHOOK_SIGNATURE_HEADER = 'x-hesabpay-signature';

/** Calendar months each subscription package lasts. */
export const PACKAGE_MONTHS: Record<SubscriptionPackage, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};
