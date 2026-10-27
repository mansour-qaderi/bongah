import type { ChangeEvent } from 'react';

const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_INDIC_ZERO = 0x0660; // ٠

/**
 * What a Persian-only number field may hold, as a regular expression: an optional leading "+" and then Persian digits
 * (۰-۹, U+06F0..U+06F9) and nothing else. Letters (Persian ones too: a phone number or a code has none), spaces,
 * dashes, Latin digits and Arabic-Indic digits are never in a value that has passed the mask.
 */
export const PERSIAN_PHONE_PATTERN = /^\+?[۰-۹]*$/;
export const PERSIAN_DIGITS_PATTERN = /^[۰-۹]*$/;

/** The longest a mobile number may be typed: "+" and 13 digits (the "00937…" form is the longest). */
export const PHONE_MAX_DIGITS = 13;

/** Latin (0-9) and Arabic-Indic (٠-٩) digits become Persian (۰-۹). Anything else is left as it is. */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const n = code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9 ? code - ARABIC_INDIC_ZERO : code - 0x30;
    return String.fromCharCode(PERSIAN_ZERO + n);
  });
}

/**
 * The mask for a mobile number: every typed or pasted digit is written as a Persian digit, every other character is
 * dropped, and only a "+" in the first place is kept. A pasted "+93 (79) 123-4567" therefore becomes "+۹۳۷۹۱۲۳۴۵۶۷".
 * Typing on an English keyboard works (the digits turn into Persian ones as they are typed), typing letters does not.
 */
export function maskPersianPhone(raw: string): string {
  const converted = toPersianDigits(raw);
  const plus = converted.trimStart().startsWith('+') ? '+' : '';
  const digits = converted.replace(/[^۰-۹]/g, '').slice(0, PHONE_MAX_DIGITS);
  return plus + digits;
}

/** The mask for a one-time code (or any run of digits): Persian digits only, at most `maxLength` of them. */
export function maskPersianDigits(raw: string, maxLength: number): string {
  return toPersianDigits(raw)
    .replace(/[^۰-۹]/g, '')
    .slice(0, maxLength);
}

/**
 * Applies a mask to what an <input> just changed to, and keeps the caret where the person was typing: the caret goes
 * after the same number of kept characters it had before, instead of jumping to the end when the mask dropped or
 * rewrote something earlier in the text. Returns the masked value; `commit` gives it to whoever owns the state.
 */
export function applyMask(event: ChangeEvent<HTMLInputElement>, mask: (raw: string) => string, commit: (value: string) => void): string {
  const input = event.currentTarget;
  const raw = input.value;
  const caret = input.selectionStart ?? raw.length;
  const masked = mask(raw);
  commit(masked);
  if (masked !== raw) {
    const keptBeforeCaret = mask(raw.slice(0, caret)).length;
    // The input is controlled: once React has written the masked value, put the caret back.
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(keptBeforeCaret, keptBeforeCaret);
    });
  }
  return masked;
}
