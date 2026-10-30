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

/**
 * Province/district names are free text, so two spellings of the same place would otherwise
 * never match in a filter. Dari/Pashto keyboards produce Arabic look-alike letters
 * (ي ى ك) instead of the Persian ی ک, so fold those, apply NFKC and tidy whitespace.
 * Storing and filtering both go through this, so they always agree.
 */
export function normalizePlaceName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A province or district name, normalised with {@link normalizePlaceName}. */
export const placeName = (max: number) =>
  z
    .string()
    .transform(normalizePlaceName)
    .pipe(z.string().min(2, 'Too short').max(max, `At most ${max} characters`));

/** Trimmed text with internal whitespace runs collapsed (names, titles). */
export const cleanText = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, `At least ${min} characters`).max(max, `At most ${max} characters`));

/**
 * Free text that keeps its line breaks (a listing's description). Each line is tidied the way `cleanText` tidies
 * a name (runs of spaces and tabs become one space, the ends are trimmed), but the breaks between lines stay: a
 * blank line separates paragraphs, any more than one blank line in a row collapses to one, and the ends of the whole
 * text are trimmed. (`cleanText` turns every whitespace run, new lines included, into one space, which would
 * flatten a written-out description into a single line.)
 */
export const multilineText = (min: number, max: number) =>
  z
    .string()
    .transform((value) =>
      value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().min(min, `At least ${min} characters`).max(max, `At most ${max} characters`));

/** An http(s) URL. Plain z.url() would also accept javascript: and data: URLs. */
export const httpUrl = z.url({ protocol: /^https?$/ }).max(2048);

/** Largest value the NUMERIC(14,2) money columns can hold. */
/**
 * The largest price or fee: just under 10^14. Rials need the room (a 200-billion-toman villa is 2 * 10^12 rials), and
 * the database column holds 16 digits before the decimal point. Below 10^14 a double still keeps two decimals exactly.
 */
export const MAX_MONEY = 99_999_999_999_999;

/** A positive amount with at most 2 decimal places, as a JSON number. */
export const moneyAmount = z
  .number()
  .positive()
  .max(MAX_MONEY)
  // String(n) is the shortest exact representation, so this is a precise decimal-places check.
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(String(value)), 'At most 2 decimal places');
