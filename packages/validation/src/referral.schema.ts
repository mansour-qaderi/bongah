import { z } from 'zod';
import { toAsciiDigits } from './common';

/** Characters a referral code is made of: no I, O, 0 or 1, which people misread when typing from a message. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 8;

const CODE_PATTERN = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);
// Spaces, hyphens, and the invisible direction marks Dari/Pashto keyboards and chat apps add around text.
const NOISE = /[\s\-​-‏‪-‮⁦-⁩]/g;

/** What a person typed or pasted, reduced to the characters that matter ("" when nothing is left). */
function strip(input: string): string {
  return toAsciiDigits(input).replace(NOISE, '').toUpperCase();
}

/**
 * Turns what a person typed ("abcd-2345", " ab cd 2345 ", Persian digits) into the canonical
 * code, or returns null when it cannot be a code. Does not check that the code exists.
 */
export function normalizeReferralCode(input: string): string | null {
  const code = strip(input);
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * The optional referral code on sign-up. Left empty (or only spaces) it means "no code";
 * anything else must look like a code, in canonical form on output.
 */
export const optionalReferralCode = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || strip(value) === '') return undefined;
    const code = normalizeReferralCode(value);
    if (!code) {
      ctx.addIssue({ code: 'custom', message: 'Invalid referral code' });
      return z.NEVER;
    }
    return code;
  });

/**
 * POST /rewards/ladders/spend: spend ladders either on one more listing (three, when the free ones are used up) or
 * on a featured frame for one of my listings.
 */
export const spendLaddersSchema = z.discriminatedUnion('purpose', [
  z.strictObject({ purpose: z.literal('LISTING_QUOTA') }),
  z.strictObject({ purpose: z.literal('FEATURED_FRAME'), property_id: z.uuid() }),
]);
export type SpendLaddersInput = z.output<typeof spendLaddersSchema>;
