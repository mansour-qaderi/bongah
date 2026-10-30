import { z } from 'zod';
import { FEATURED_BUNDLE_SIZES, MARKETS, SUBSCRIPTION_PACKAGES } from '@bongah/shared-types';
import { toAsciiDigits } from './common';

/** GET /hesabpay/pricing: which market's prices (Afghanistan's when left out). */
export const pricingQuerySchema = z.strictObject({ market: z.enum(MARKETS).optional() });
export type PricingQuery = z.output<typeof pricingQuerySchema>;

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
  // A prepaid map pin. Not tied to a listing: it is spent when a listing gets its pin.
  z.strictObject({
    purpose: z.literal('MAP_LOCATION'),
  }),
  // A pack of contact reveal credits. The server decides the pack size and price (see Pricing).
  z.strictObject({
    purpose: z.literal('CONTACT_CREDITS'),
  }),
  // A bundle of featured-listing credits (3, 5, 10 or 20), spent on listings later. The server sets the price.
  z.strictObject({
    purpose: z.literal('FEATURED_CREDITS'),
    bundle_size: z.custom<(typeof FEATURED_BUNDLE_SIZES)[number]>(
      (value) => typeof value === 'number' && (FEATURED_BUNDLE_SIZES as readonly number[]).includes(value),
      { message: `bundle_size must be one of ${FEATURED_BUNDLE_SIZES.join(', ')}` },
    ),
  }),
]);
export type InitiatePaymentInput = z.output<typeof initiatePaymentSchema>;

/**
 * POST /hesabpay/payments/:id/reference: the transaction id printed on the HesabPay / bank receipt. Letters, digits and
 * the few separators such ids contain; Persian digits are accepted and stored as 0-9.
 */
export const submitPaymentReferenceSchema = z.strictObject({
  reference: z
    .string()
    .transform((value) => toAsciiDigits(value).replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(4, 'The reference is too short.')
        .max(64, 'The reference is too long.')
        .regex(/^[A-Za-z0-9](?:[A-Za-z0-9 ._/-]*[A-Za-z0-9])?$/, 'Use only the letters and digits printed on the receipt.'),
    ),
});
export type SubmitPaymentReferenceInput = z.output<typeof submitPaymentReferenceSchema>;

/** POST /hesabpay/featured-credits/use: spend one featured-listing credit on one of my listings. */
export const useFeaturedCreditSchema = z.strictObject({
  property_id: z.uuid(),
});
export type UseFeaturedCreditInput = z.output<typeof useFeaturedCreditSchema>;
