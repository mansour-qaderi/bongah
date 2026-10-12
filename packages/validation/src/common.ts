import { z } from 'zod';

/** Length of the one-time passcode sent by SMS. Shared so the API and the mobile UI agree. */
export const OTP_LENGTH = 6;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Dari/Pashto keyboards type Persian (۰-۹) or Arabic-Indic (٠-٩) digits; convert them to 0-9. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch);
    return String(persian >= 0 ? persian : ARABIC_INDIC_DIGITS.indexOf(ch));
  });
}

/**
 * Normalises an Afghan mobile number to canonical E.164 (+937XXXXXXXX), or returns null.
 * Accepts 07XXXXXXXX, 7XXXXXXXX, 937XXXXXXXX, +937XXXXXXXX and 00937XXXXXXXX,
 * with spaces/dashes/brackets and Persian digits.
 *
 * The users table has a UNIQUE constraint on phone_number, which only dedupes identical
 * strings, so every phone number must pass through here before it is stored or compared.
 */
export function normalizeAfghanMobile(input: string): string | null {
  let n = toAsciiDigits(input).replace(/[\s\-().]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0093')) n = n.slice(4);
  else if (n.startsWith('93')) n = n.slice(2);
  else if (n.startsWith('0')) n = n.slice(1);
  return /^7\d{8}$/.test(n) ? `+93${n}` : null;
}

/** Validates an Afghan mobile number and outputs it in canonical +93 form. */
export const afghanMobile = z.string().transform((value, ctx) => {
  const normalized = normalizeAfghanMobile(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'Invalid Afghan mobile number' });
    return z.NEVER;
  }
  return normalized;
});

/** A numeric OTP of exactly OTP_LENGTH digits (Persian digits accepted). */
export const otpCode = z
  .string()
  .transform((value) => toAsciiDigits(value).replace(/\s/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `OTP must be ${OTP_LENGTH} digits`));
