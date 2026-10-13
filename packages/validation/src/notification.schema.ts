import { z } from 'zod';
import { LANGUAGES, PUSH_PLATFORMS, QUOTE_CATEGORIES, QUOTE_MAX_LENGTH } from '@bongah/shared-types';
import { cleanText } from './common';
import { booleanQuery, searchQuery } from './moderation.schema';
import { paginationShape } from './property.schema';

// ───────────── Quote templates (admin) ─────────────

const quoteShape = {
  text: cleanText(3, QUOTE_MAX_LENGTH),
  category: z.enum(QUOTE_CATEGORIES),
  language: z.enum(LANGUAGES).default('prs'),
  is_active: z.boolean().default(true),
};

/** POST /admin/quotes */
export const createQuoteSchema = z.strictObject(quoteShape);
export type CreateQuoteInput = z.output<typeof createQuoteSchema>;

/** PATCH /admin/quotes/:id: any subset. Fields left out are not touched (no defaults here). */
export const updateQuoteSchema = z
  .strictObject({
    text: quoteShape.text,
    category: quoteShape.category,
    language: z.enum(LANGUAGES),
    is_active: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to update');
export type UpdateQuoteInput = z.output<typeof updateQuoteSchema>;

/** GET /admin/quotes */
export const adminQuotesQuerySchema = z.strictObject({
  ...paginationShape,
  category: z.enum(QUOTE_CATEGORIES).optional(),
  language: z.enum(LANGUAGES).optional(),
  is_active: booleanQuery.optional(),
  q: searchQuery,
});
export type AdminQuotesQuery = z.output<typeof adminQuotesQuerySchema>;

// ───────────── Welcome card (signed-in user) ─────────────

/** GET /quotes/welcome. The app sends the language it is displaying; a missing one means Dari. */
export const welcomeQuoteQuerySchema = z.strictObject({
  language: z.enum(LANGUAGES).default('prs'),
});
export type WelcomeQuoteQuery = z.output<typeof welcomeQuoteQuerySchema>;

// ───────────── Preferences ─────────────

/**
 * PATCH /users/me/preferences. `has_seen_welcome` can only be set to true: the welcome card is shown
 * once, and there is no way to ask for it again.
 */
export const updatePreferencesSchema = z
  .strictObject({
    enable_daily_motivation: z.boolean(),
    has_seen_welcome: z.literal(true),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to update');
export type UpdatePreferencesInput = z.output<typeof updatePreferencesSchema>;

// ───────────── Push devices ─────────────

/** A push token from FCM (Android) or APNs-via-FCM (iOS) is a long opaque string; this only rules out junk. */
const pushToken = z
  .string()
  .trim()
  .min(10)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/, 'Not a push token');

/** PUT /notifications/devices */
export const registerDeviceSchema = z.strictObject({
  token: pushToken,
  platform: z.enum(PUSH_PLATFORMS),
  language: z.enum(LANGUAGES).default('prs'),
});
export type RegisterDeviceInput = z.output<typeof registerDeviceSchema>;

/** DELETE /notifications/devices */
export const removeDeviceSchema = z.strictObject({ token: pushToken });
export type RemoveDeviceInput = z.output<typeof removeDeviceSchema>;
