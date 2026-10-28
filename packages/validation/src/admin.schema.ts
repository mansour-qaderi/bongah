import { z } from 'zod';
import {
  BANNER_PLACEMENTS,
  PRICING_KEYS,
  PROPERTY_STATUSES,
  TRANSACTION_METHODS,
  TRANSACTION_PURPOSES,
  TRANSACTION_STATUSES,
} from '@bongah/shared-types';
import { cleanText, httpUrl, moneyAmount } from './common';
import { booleanQuery, searchQuery } from './moderation.schema';
import { paginationShape, queryInt } from './property.schema';

/** A calendar date, YYYY-MM-DD (and a real one: 2026-02-31 is refused). */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Not a real date');

/** How many days back the analytics endpoints look. */
export const ANALYTICS_MIN_DAYS = 7;
export const ANALYTICS_MAX_DAYS = 90;
export const ANALYTICS_DEFAULT_DAYS = 30;

/** GET /admin/analytics/overview and GET /agencies/me/analytics */
export const analyticsQuerySchema = z.strictObject({
  days: queryInt(ANALYTICS_MIN_DAYS, ANALYTICS_MAX_DAYS).default(ANALYTICS_DEFAULT_DAYS),
});
export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>;

/** GET /admin/transactions */
export const adminTransactionsQuerySchema = z
  .strictObject({
    ...paginationShape,
    status: z.enum(TRANSACTION_STATUSES).optional(),
    purpose: z.enum(TRANSACTION_PURPOSES).optional(),
    method: z.enum(TRANSACTION_METHODS).optional(),
    /** true: only payments that wait for a person to look at them (pending, and paid by hand). */
    awaiting_review: booleanQuery.optional(),
    /** A receipt number, a HesabPay id, or part of the payer's phone number. */
    q: searchQuery,
    /** Kabul calendar dates, inclusive. */
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    message: 'from must not be after to',
    path: ['from'],
  });
export type AdminTransactionsQuery = z.output<typeof adminTransactionsQuerySchema>;

/**
 * POST /admin/transactions/:id/force-activate and /reject. The reason is kept in the audit log and (for a refusal)
 * shown to the customer, so it has to say something.
 */
export const adminPaymentDecisionSchema = z.strictObject({
  reason: cleanText(3, 300),
});
export type AdminPaymentDecisionInput = z.output<typeof adminPaymentDecisionSchema>;

/** GET /admin/audit-log */
export const adminAuditQuerySchema = z.strictObject({
  ...paginationShape,
  action: z.string().regex(/^[A-Z_]{3,40}$/).optional(),
  actor_id: z.uuid().optional(),
  target_type: z.string().regex(/^[a-z_]{2,30}$/).optional(),
  target_id: z.string().max(64).optional(),
});
export type AdminAuditQuery = z.output<typeof adminAuditQuerySchema>;

/** GET /admin/properties */
export const adminPropertiesQuerySchema = z.strictObject({
  ...paginationShape,
  /** Part of the title, or the owner's phone number. */
  q: searchQuery,
  status: z.enum(PROPERTY_STATUSES).optional(),
  /** true: only listings whose paid featured badge is running now. */
  featured: booleanQuery.optional(),
  /** true: only listings an admin took down. */
  removed: booleanQuery.optional(),
  owner_id: z.uuid().optional(),
});
export type AdminPropertiesQuery = z.output<typeof adminPropertiesQuerySchema>;

/** POST /admin/properties/:id/feature: give a listing a featured badge for N days, free of charge. */
export const featureListingSchema = z.strictObject({ days: z.int().min(1).max(365) });
export type FeatureListingInput = z.output<typeof featureListingSchema>;

/** POST /admin/properties/:id/remove */
export const removeListingSchema = z.strictObject({ reason: cleanText(3, 500) });
export type RemoveListingInput = z.output<typeof removeListingSchema>;

// ───────────── Banners ─────────────

const isoInstant = z.iso.datetime({ offset: true });

const bannerShape = {
  title: cleanText(1, 100),
  image_url: httpUrl,
  link_property_id: z.uuid().nullable(),
  link_url: httpUrl.nullable(),
  placement: z.enum(BANNER_PLACEMENTS),
  sort_order: z.int().min(0).max(10_000),
  is_active: z.boolean(),
  starts_at: isoInstant.nullable(),
  ends_at: isoInstant.nullable(),
};

function windowIsForward(value: { starts_at?: string | null; ends_at?: string | null }): boolean {
  if (!value.starts_at || !value.ends_at) return true;
  return new Date(value.ends_at).getTime() > new Date(value.starts_at).getTime();
}

/** POST /admin/banners */
export const createBannerSchema = z
  .strictObject({
    ...bannerShape,
    link_property_id: bannerShape.link_property_id.default(null),
    link_url: bannerShape.link_url.default(null),
    sort_order: bannerShape.sort_order.default(0),
    is_active: bannerShape.is_active.default(true),
    starts_at: bannerShape.starts_at.default(null),
    ends_at: bannerShape.ends_at.default(null),
  })
  .refine((value) => value.link_property_id === null || value.link_url === null, {
    message: 'A banner links to a listing or to a web address, not both',
    path: ['link_url'],
  })
  .refine(windowIsForward, { message: 'ends_at must be after starts_at', path: ['ends_at'] });
export type CreateBannerInput = z.output<typeof createBannerSchema>;

/** PATCH /admin/banners/:id: any subset. (The "not both links" and window rules are re-checked against the stored banner.) */
export const updateBannerSchema = z
  .strictObject(bannerShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to update')
  .refine((value) => !value.link_property_id || !value.link_url, {
    message: 'A banner links to a listing or to a web address, not both',
    path: ['link_url'],
  })
  .refine(windowIsForward, { message: 'ends_at must be after starts_at', path: ['ends_at'] });
export type UpdateBannerInput = z.output<typeof updateBannerSchema>;

/** GET /banners (public) */
export const publicBannersQuerySchema = z.strictObject({ placement: z.enum(BANNER_PLACEMENTS).optional() });
export type PublicBannersQuery = z.output<typeof publicBannersQuerySchema>;

// ───────────── Prices ─────────────

/** PUT /admin/pricing/:key. `quantity` only applies to featured days and credit packs (the API checks which). */
export const setPricingSchema = z.strictObject({
  price: moneyAmount,
  quantity: z.int().min(1).max(9999).optional(),
});
export type SetPricingInput = z.output<typeof setPricingSchema>;

export const pricingKeySchema = z.enum(PRICING_KEYS);
