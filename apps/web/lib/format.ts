import { toAsciiDigits } from '@bongah/validation';
import type { Currency } from '@bongah/shared-types';

export { toAsciiDigits };

const numberFormat = new Intl.NumberFormat('fa-AF-u-nu-arabext', { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat('fa-AF-u-nu-arabext', { notation: 'compact', maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-arabext', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const shortDateFormat = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-arabext', { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-arabext', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kabul',
});

/** 1234567 -> ۱٬۲۳۴٬۵۶۷ */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return numberFormat.format(value);
}

/** 12500 -> ۱۲٫۵ هزار. For chart axes and crowded cards. */
export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

export const CURRENCY_LABEL: Record<Currency, string> = { AFGHANI: 'افغانی', USD: 'دالر' };

/** ۱٬۲۰۰٬۰۰۰ افغانی */
export function formatMoney(value: number | null | undefined, currency: Currency): string {
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value)} ${CURRENCY_LABEL[currency]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFormat.format(d);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : shortDateFormat.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormat.format(d);
}

/** "YYYY-MM-DD" (a Kabul calendar day from the API) as a short Jalali date. */
export function formatDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return shortDateFormat.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "۳ روز پیش", "همین حالا". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'همین حالا';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${formatNumber(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${formatNumber(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${formatNumber(days)} روز پیش`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${formatNumber(months)} ماه پیش`;
  return `${formatNumber(Math.floor(months / 12))} سال پیش`;
}

/** +93791234567 -> 0791 234 567 (digits as typed in Afghanistan, shown left to right). */
export function formatPhone(e164: string): string {
  const m = /^\+93(7\d{8})$/.exec(e164);
  if (!m) return e164;
  const n = `0${m[1]}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
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
