import { z } from 'zod';
import { SUBSCRIPTION_PACKAGES } from '@bongah/shared-types';

/**
 * POST /hesabpay/payments. There is deliberately no `amount` or `currency`: what something
 * costs is decided by the server, never by the client.
 */
export const initiatePaymentSchema = z.discriminatedUnion('purpose', [
  z.strictObject({
    purpose: z.literal('SUBSCRIPTION'),
    package_type: z.enum(SUBSCRIPTION_PACKAGES),
  }),
  z.strictObject({
    purpose: z.literal('LADDER'),
    property_id: z.uuid(),
  }),
  z.strictObject({
    purpose: z.literal('FEATURED_AD'),
    property_id: z.uuid(),
  }),
]);
export type InitiatePaymentInput = z.output<typeof initiatePaymentSchema>;
