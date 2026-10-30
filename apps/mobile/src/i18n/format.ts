import type { Currency } from '@bongah/shared-types';
import { toAsciiDigits } from '@bongah/validation';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const THOUSANDS_SEPARATOR = ',';
const DECIMAL_SEPARATOR = '٫';

/**
 * Any digits → Persian ۰-۹. Western 0-9 and Arabic-Indic ٠-٩ (what some keyboards type) both become the
 * Persian forms, because that is what Dari and Pashto readers expect on screen. Everything else is left alone.
 * Takes a number too: `toPersianDigits(1200)` is "۱۲۰۰" (no separators; use `formatNumber` for those).
 */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9٠-٩]/g, ch => {
    const code = ch.charCodeAt(0);
    // ٠-٩ are U+0660-0669; the Persian forms ۰-۹ are U+06F0-06F9, ten places along.
    return PERSIAN_DIGITS[code >= 0x660 ? code - 0x660 : code - 0x30];
  });
}

/** Persian or Arabic-Indic digits → 0-9. The form the API and the validators expect. */
export { toAsciiDigits as toLatinDigits };

/** 1234567.5 → ۱,۲۳۴,۵۶۷٫۵ (at most `maxFraction` decimals, no trailing zeros). */
export function formatNumber(value: number, maxFraction = 2): string {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** maxFraction;
  const rounded = Math.round(value * factor) / factor;
  const [whole, fraction] = Math.abs(rounded).toString().split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  const sign = rounded < 0 ? '-' : '';
  return toPersianDigits(
    sign + grouped + (fraction ? DECIMAL_SEPARATOR + fraction : ''),
  );
}

/** The currency word comes from the translations (currency.AFGHANI / currency.USD). */
export function formatPrice(amount: number, currencyLabel: string): string {
  return `${formatNumber(amount)} ${currencyLabel}`;
}

/** The sign written after a price: ؋ for Afghani, $ for dollars, the word «تومان» / «ریال» for Iran's. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AFGHANI: '؋',
  USD: '$',
  // Iran writes the word after the number; there is no short sign in everyday use.
  TOMAN: 'تومان',
  RIAL: 'ریال',
};

/**
 * The number part of a price: Persian digits grouped in thousands with plain commas (1200000 is "۱,۲۰۰,۰۰۰").
 * It is the same grouping `formatNumber` uses, so a figure reads the same everywhere in the app.
 */
export function formatAmount(amount: number, maxFraction = 2): string {
  return formatNumber(amount, maxFraction);
}

/**
 * An amount of money as plain text, the way the app writes it in sentences and helper lines:
 * `formatCurrency(1200000)` is "۱,۲۰۰,۰۰۰ ؋". Afghani unless told otherwise. (Where the sign can be styled, the
 * `Price` component draws the same two parts with a smaller sign.)
 */
export function formatCurrency(
  amount: number,
  currency: Currency = 'AFGHANI',
): string {
  if (!Number.isFinite(amount)) return '';
  return `${formatAmount(amount)} ${CURRENCY_SYMBOLS[currency]}`;
}

export type AmountUnit = 'billion' | 'million' | 'thousand';

const AMOUNT_STEPS: ReadonlyArray<[AmountUnit, number]> = [
  ['billion', 1e9],
  ['million', 1e6],
  ['thousand', 1e3],
];

/**
 * A short form of a big amount for small spaces (map markers): 2,500,000 is 2.5 million, 50,000 is 50 thousand.
 * One decimal at most; below one thousand the number is left whole (unit null). Rounding never produces
 * "1000 thousand": that becomes "1 million".
 */
export function compactAmount(amount: number): {
  value: number;
  unit: AmountUnit | null;
} {
  if (!Number.isFinite(amount) || amount < 1000)
    return { value: amount, unit: null };
  for (let i = 0; i < AMOUNT_STEPS.length; i++) {
    const [unit, size] = AMOUNT_STEPS[i];
    if (amount < size) continue;
    const value = Math.round((amount / size) * 10) / 10;
    if (value >= 1000 && i > 0)
      return { value: 1, unit: AMOUNT_STEPS[i - 1][0] };
    return { value, unit };
  }
  return { value: amount, unit: null };
}

/**
 * Reads a number a person typed: Persian/Arabic-Indic digits, "٬" "," as thousands
 * separators, "." "٫" as the decimal point. Returns null for empty or unreadable input.
 */
export function parseNumberInput(text: string): number | null {
  const cleaned = toAsciiDigits(text)
    .replace(/[٬,\s]/g, '')
    .replace(/٫/g, '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Kabul is UTC+4:30 all year (no daylight saving). */
export const KABUL_OFFSET_MS = 4.5 * 60 * 60 * 1000;

/**
 * Formats a timestamp as a numeric date in Kabul time (UTC+4:30), e.g. ۲۰۲۶/۱۰/۱۲.
 * This is the Gregorian calendar. Sentences meant for readers use the Solar Hijri one: see `formatSolarDate`.
 */
export function formatDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const d = new Date(time + KABUL_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return toPersianDigits(`${d.getUTCFullYear()}/${mm}/${dd}`);
}

/** The time of day in Kabul time, e.g. ۱۴:۰۵ (chat message times). */
export function formatTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const d = new Date(time + KABUL_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return toPersianDigits(`${hh}:${mm}`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How a conversation's last message is dated in the list: the time today, "yesterday", or the date. */
export type ChatStamp =
  | { kind: 'time'; text: string }
  | { kind: 'yesterday' }
  | { kind: 'date'; text: string };

/** Decides which of the three a timestamp is, by Kabul calendar days (not by 24-hour spans). `null` if unreadable. */
export function chatStamp(
  iso: string,
  now: number = Date.now(),
): ChatStamp | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const day = (ms: number) => Math.floor((ms + KABUL_OFFSET_MS) / DAY_MS);
  const age = day(now) - day(time);
  if (age === 0) return { kind: 'time', text: formatTime(iso) };
  if (age === 1) return { kind: 'yesterday' };
  return { kind: 'date', text: formatDate(iso) };
}

/** Left-to-right embedding marks: text between them keeps its own order inside a right-to-left line. */
const LTR_START = '\u202A';
const LTR_END = '\u202C';

/**
 * Formats a phone number in canonical +93 form for display: +۹۳ ۷۰ ۱۲۳ ۴۵۶۷.
 * A phone number reads left to right, but in a right-to-left line its groups of digits would be laid out in
 * reverse ("۴۵۶۷ ۱۲۳ ۷۰ ۹۳+"), so it is wrapped in direction marks that keep it in order.
 */
export function formatPhone(e164: string): string {
  const m = /^\+93(\d{2})(\d{3})(\d{4})$/.exec(e164);
  const text = m ? `+93 ${m[1]} ${m[2]} ${m[3]}` : e164;
  return `${LTR_START}${toPersianDigits(text)}${LTR_END}`;
}
