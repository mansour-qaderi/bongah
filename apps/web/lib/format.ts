import { toAsciiDigits } from '@bongah/validation';
import type { Currency } from '@bongah/shared-types';
import { tNow } from '@/i18n/active';
import type { MessageKey } from '@/i18n/translate';
import { toPersianDigits } from './persian-input';

export { toAsciiDigits };

const numberFormat = new Intl.NumberFormat('fa-AF-u-nu-arabext', { maximumFractionDigits: 2 });

/** The Solar Hijri (Jalali) calendar day of a moment, as numbers; Kabul's clock, because that is where the API's days are. */
const solarParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Kabul',
});
const clockParts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kabul' });

interface SolarDay {
  year: number;
  month: number;
  day: number;
}

function solarDay(d: Date): SolarDay | null {
  const out: Partial<SolarDay> = {};
  for (const part of solarParts.formatToParts(d)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') out[part.type] = Number(part.value);
  }
  return out.year && out.month && out.day ? (out as SolarDay) : null;
}

/**
 * Built from the numbers instead of the browser's own wording: the month names are ours (the same ones the phone app
 * shows, Dari or Pashto), and the browser's Pashto date adds an era ("AP") and its own digits.
 */
function solarText(d: Date, withYear: boolean): string {
  const s = solarDay(d);
  if (!s) return '—';
  const month = tNow(`date.month.${s.month}` as MessageKey);
  return toPersianDigits(withYear ? `${s.day} ${month} ${s.year}` : `${s.day} ${month}`);
}

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 1234567 -> ۱٬۲۳۴٬۵۶۷ */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return numberFormat.format(value);
}

/** 12500 -> ۱۲٫۵ هزار (Pashto: زر). For chart axes and crowded cards; the unit words follow the language. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const steps: Array<[MessageKey, number]> = [
    ['unit.billion', 1e9],
    ['unit.million', 1e6],
    ['unit.thousand', 1e3],
  ];
  for (const [unit, size] of steps) {
    if (abs >= size) {
      const scaled = Math.round((value / size) * 10) / 10;
      return `${new Intl.NumberFormat('fa-AF-u-nu-arabext', { maximumFractionDigits: 1 }).format(scaled)} ${tNow(unit)}`;
    }
  }
  return numberFormat.format(value);
}

/** The currency's name in the language shown now. */
export const currencyName = (currency: Currency): string => tNow(`label.currency.${currency}` as MessageKey);

/** ۱٬۲۰۰٬۰۰۰ افغانی */
export function formatMoney(value: number | null | undefined, currency: Currency): string {
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value)} ${currencyName(currency)}`;
}

/** ۱۰ عقرب ۱۴۰۵ */
export function formatDate(iso: string | null | undefined): string {
  const d = validDate(iso);
  return d ? solarText(d, true) : '—';
}

/** ۱۰ عقرب */
export function formatShortDate(iso: string | null | undefined): string {
  const d = validDate(iso);
  return d ? solarText(d, false) : '—';
}

/** ۱۰ عقرب ۱۴۰۵، ۱۶:۳۰ (Kabul time) */
export function formatDateTime(iso: string | null | undefined): string {
  const d = validDate(iso);
  if (!d) return '—';
  const clock = clockParts
    .formatToParts(d)
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('');
  return `${solarText(d, true)}، ${toPersianDigits(clock)}`;
}

/** "YYYY-MM-DD" (a Kabul calendar day from the API) as a short Jalali date. */
export function formatDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return solarText(new Date(Date.UTC(y, m - 1, d, 12)), false);
}

/** "۳ روز پیش", "همین حالا" (Pashto: "۳ ورځې مخکې", "همدا اوس"). */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return tNow('time.now');
  const mins = Math.floor(diff / 60);
  if (mins < 60) return tNow('time.minutesAgo', { n: formatNumber(mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tNow('time.hoursAgo', { n: formatNumber(hours) });
  const days = Math.floor(hours / 24);
  if (days < 30) return tNow('time.daysAgo', { n: formatNumber(days) });
  const months = Math.floor(days / 30);
  if (months < 12) return tNow('time.monthsAgo', { n: formatNumber(months) });
  return tNow('time.yearsAgo', { n: formatNumber(Math.floor(months / 12)) });
}

/** +93791234567 -> 0791 234 567 (digits as typed in Afghanistan, shown left to right). */
export function formatPhone(e164: string): string {
  const m = /^\+93(7\d{8})$/.exec(e164);
  if (!m) return toPersianDigits(e164);
  const n = `0${m[1]}`;
  return toPersianDigits(`${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`);
}

/**
 * A number typed by a person ("۱٬۲۰۰", "1,200.5", "١٢٠٠"): Persian/Arabic digits, group separators and the Arabic
 * decimal mark accepted. Null when it is empty or not a number.
 */
export function parseLooseNumber(input: string): number | null {
  const cleaned = toAsciiDigits(input)
    .replace(/[٬,،\s]/g, '')
    .replace(/٫/g, '.');
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
