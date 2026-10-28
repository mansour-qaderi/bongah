import { toLatinDigits } from '../i18n/format';

/** Letters and digits with a few separators inside, as a transaction id is printed on a receipt (same rule as the API). */
const PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 ._/-]*[A-Za-z0-9])?$/;

/** What is sent: Persian digits as 0-9, runs of spaces as one, no space at the ends. */
export function cleanReference(text: string): string {
  return toLatinDigits(text).replace(/\s+/g, ' ').trim();
}

/** Whether the API will accept it (4 to 64 characters of the allowed kind). */
export function isValidReference(text: string): boolean {
  const value = cleanReference(text);
  return value.length >= 4 && value.length <= 64 && PATTERN.test(value);
}
