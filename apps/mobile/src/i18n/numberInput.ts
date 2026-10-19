import { toAsciiDigits } from '@bongah/validation';
import { toPersianDigits } from './format';

/** The decimal point as it is shown (Persian ٫); the value handed to screens uses a plain ".". */
const SHOWN_DECIMAL = '٫';

/** A character that is part of the number itself (a digit in any script, or a decimal point). */
const isSignificant = (ch: string): boolean => /[0-9٠-٩۰-۹.٫]/.test(ch);

/**
 * What a screen stores for a number field: plain 0-9, "." as the decimal point, and no thousands separators
 * or spaces. (`parseNumberInput` reads this form, and so does the API.)
 */
export function toRawNumber(text: string): string {
  return toAsciiDigits(text)
    .replace(/[,٬،\s]/g, '')
    .replace(/٫/g, '.');
}

/**
 * The raw number as it is shown in the field: Persian digits, the whole part grouped in thousands with
 * commas ("1300000" is "۱,۳۰۰,۰۰۰"), and a Persian decimal point. A value that is not a plain number
 * (someone typed letters) is only given Persian digits, never regrouped.
 */
export function groupNumber(raw: string): string {
  const dot = raw.indexOf('.');
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const fraction = dot === -1 ? '' : SHOWN_DECIMAL + raw.slice(dot + 1);
  if (!/^\d+$/.test(whole)) return toPersianDigits(raw);
  return (
    toPersianDigits(whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) +
    toPersianDigits(fraction)
  );
}

/** The text field's state just before an edit: what it showed and where the caret / selection was. */
export interface FieldState {
  shown: string;
  start: number;
  end: number;
}

export interface NumberEdit {
  /** What the screen should store. */
  raw: string;
  /** What the field should show. */
  shown: string;
  /**
   * Where the caret belongs in `shown`, or null when it is at the end (the common case: the keyboard puts
   * it there by itself, so nothing needs to be forced).
   */
  caret: number | null;
}

/**
 * Handles one edit of a thousands-grouped number field.
 *
 * The keyboard hands over the text it now holds: the previously shown text with the typed change in it, so it
 * carries the old separators and whatever digits the keyboard produced. This returns the raw value, the
 * regrouped text to show, and where the caret has to go so that it stays beside the same digit even though
 * separators appeared or disappeared in front of it (typing or deleting in the middle of a number).
 *
 * Deleting just a separator would otherwise do nothing visible (the number is regrouped straight away and the
 * comma comes back), so it deletes the digit before it instead, which is what the person is reaching for.
 */
export function editGroupedNumber(
  typed: string,
  before: FieldState,
): NumberEdit {
  // Everything after the old selection was left untouched, so the caret sits that far from the end.
  const fromEnd =
    before.shown.length - Math.min(before.end, before.shown.length);
  const caretInTyped = Math.max(0, typed.length - fromEnd);
  let digitsBeforeCaret = 0;
  for (const ch of typed.slice(0, caretInTyped)) {
    if (isSignificant(ch)) digitsBeforeCaret += 1;
  }

  let raw = toRawNumber(typed);
  const deletedOnlySeparator =
    typed.length < before.shown.length && raw === toRawNumber(before.shown);
  if (deletedOnlySeparator && digitsBeforeCaret > 0) {
    raw = raw.slice(0, digitsBeforeCaret - 1) + raw.slice(digitsBeforeCaret);
    digitsBeforeCaret -= 1;
  }

  const shown = groupNumber(raw);
  if (digitsBeforeCaret >= raw.length) return { raw, shown, caret: null };

  let seen = 0;
  let caret = 0;
  if (digitsBeforeCaret > 0) {
    for (let i = 0; i < shown.length; i += 1) {
      if (isSignificant(shown[i])) seen += 1;
      if (seen === digitsBeforeCaret) {
        caret = i + 1;
        break;
      }
    }
  }
  return { raw, shown, caret };
}
