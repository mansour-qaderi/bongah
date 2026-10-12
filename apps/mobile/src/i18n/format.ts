import { toAsciiDigits } from '@bongah/validation';

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const THOUSANDS_SEPARATOR = '٬';
const DECIMAL_SEPARATOR = '٫';

/** One jerib is 2,000 square metres (the Afghan land measure). */
export const SQM_PER_JERIB = 2000;

export const sqmToJerib = (sqm: number): number => sqm / SQM_PER_JERIB;
export const jeribToSqm = (jerib: number): number => jerib * SQM_PER_JERIB;

/** 0-9 → ۰-۹ (Dari and Pashto both write numbers with these digits). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)]);
}

/** 1234567.5 → ۱٬۲۳۴٬۵۶۷٫۵ (at most `maxFraction` decimals, no trailing zeros). */
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

const KABUL_OFFSET_MS = 4.5 * 60 * 60 * 1000;

/**
 * Formats a timestamp as a numeric date in Kabul time (UTC+4:30), e.g. ۲۰۲۶/۱۰/۱۲.
 * This is the Gregorian calendar; the Solar Hijri calendar is not implemented.
 */
export function formatDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const d = new Date(time + KABUL_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return toPersianDigits(`${d.getUTCFullYear()}/${mm}/${dd}`);
}

/** Formats a phone number in canonical +93 form for display: +۹۳ ۷۰ ۱۲۳ ۴۵۶۷. */
export function formatPhone(e164: string): string {
  const m = /^\+93(\d{2})(\d{3})(\d{4})$/.exec(e164);
  const text = m ? `+93 ${m[1]} ${m[2]} ${m[3]}` : e164;
  return toPersianDigits(text);
}
