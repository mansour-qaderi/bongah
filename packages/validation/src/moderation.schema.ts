import { z } from 'zod';
import {
  ABUSE_REASONS,
  ABUSE_REPORT_STATUSES,
  ABUSE_TARGET_TYPES,
  AGENCY_VERIFICATION_STATUSES,
  FEEDBACK_CATEGORIES,
  REPORT_RESOLUTION_ACTIONS,
  ROLES,
} from '@bongah/shared-types';
import { cleanText } from './common';
import { paginationShape } from './property.schema';

/** POST /reports: tell the Bongah team about an account or a listing. */
export const createReportSchema = z.strictObject({
  target_type: z.enum(ABUSE_TARGET_TYPES),
  /** The reported user's id, or the reported listing's id. */
  target_id: z.uuid(),
  reason: z.enum(ABUSE_REASONS),
  details: cleanText(1, 1000).optional(),
});
export type CreateReportInput = z.output<typeof createReportSchema>;

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Free-text search box: trimmed, at most 64 characters, blank counts as none. */
const searchQuery = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(64))
  .transform((value) => (value === '' ? undefined : value))
  .optional();

/** GET /admin/users */
export const adminUsersQuerySchema = z.strictObject({
  ...paginationShape,
  /** Part of a phone number or a name. */
  q: searchQuery,
  role: z.enum(ROLES).optional(),
  banned: booleanQuery.optional(),
});
export type AdminUsersQuery = z.output<typeof adminUsersQuerySchema>;

/** POST /admin/users/:id/ban */
export const banUserSchema = z.strictObject({ reason: cleanText(3, 500) });
export type BanUserInput = z.output<typeof banUserSchema>;

/** GET /admin/reports */
export const adminReportsQuerySchema = z.strictObject({
  ...paginationShape,
  status: z.enum(ABUSE_REPORT_STATUSES).optional(),
  target_type: z.enum(ABUSE_TARGET_TYPES).optional(),
  reason: z.enum(ABUSE_REASONS).optional(),
  /** Only reports about this account (or about listings it owns). */
  target_user_id: z.uuid().optional(),
});
export type AdminReportsQuery = z.output<typeof adminReportsQuerySchema>;

/**
 * POST /admin/reports/:id/resolve. Banning and removing need a note because it is stored as the
 * ban / takedown reason (admins only; the account owner is not shown it); dismissing and resolving may go without one.
 */
export const resolveReportSchema = z
  .strictObject({
    action: z.enum(REPORT_RESOLUTION_ACTIONS),
    note: cleanText(3, 1000).optional(),
  })
  .refine((value) => (value.action !== 'BAN_USER' && value.action !== 'REMOVE_LISTING') || value.note !== undefined, {
    message: 'A note is required to ban an account or remove a listing',
    path: ['note'],
  });
export type ResolveReportInput = z.output<typeof resolveReportSchema>;

/** GET /admin/agencies */
export const adminAgenciesQuerySchema = z.strictObject({
  ...paginationShape,
  status: z.enum(AGENCY_VERIFICATION_STATUSES).optional(),
  /** Part of the agency name or the owner's phone number. */
  q: searchQuery,
});
export type AdminAgenciesQuery = z.output<typeof adminAgenciesQuerySchema>;

/** PUT /admin/agencies/:id/verification */
export const reviewAgencySchema = z
  .strictObject({
    status: z.enum(['VERIFIED', 'REJECTED']),
    /** Required to reject (the agency reads it), not allowed when approving. */
    reason: cleanText(3, 500).optional(),
  })
  .refine((value) => (value.status === 'REJECTED') === (value.reason !== undefined), {
    message: 'A reason is required to reject an agency, and only then',
    path: ['reason'],
  });
export type ReviewAgencyInput = z.output<typeof reviewAgencySchema>;

export { booleanQuery, searchQuery };

/** GET /admin/feedback: the messages sent from the app's feedback form, newest first. */
export const adminFeedbackQuerySchema = z.strictObject({
  ...paginationShape,
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  /** Part of the message, or the sender's name or phone number. */
  q: searchQuery,
});
export type AdminFeedbackQuery = z.output<typeof adminFeedbackQuerySchema>;

/** The most of one gift an admin may give in one go (a slip of the finger must not hand out hundreds). */
export const GIFT_MAX_CREDITS = 50;

/**
 * POST /admin/users/:id/gift: free listings and/or featured frames for an account. At least one of the two, and a short
 * note for the record (the account's owner is not shown it).
 */
export const giftUserSchema = z
  .strictObject({
    listing_credits: z.int().min(0).max(GIFT_MAX_CREDITS).default(0),
    featured_credits: z.int().min(0).max(GIFT_MAX_CREDITS).default(0),
    note: cleanText(3, 200).optional(),
  })
  .refine((value) => value.listing_credits > 0 || value.featured_credits > 0, {
    message: 'Give at least one listing or one featured frame',
    path: ['listing_credits'],
  });
export type GiftUserInput = z.output<typeof giftUserSchema>;
