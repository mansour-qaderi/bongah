import type { TFunction } from 'i18next';
import { KABUL_OFFSET_MS, toPersianDigits } from './format';

/** 1 is the first month (حمل / وری), 12 the last (حوت / کب). */
export type SolarMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface SolarDate {
  year: number;
  month: SolarMonth;
  day: number;
}

// Days before the first of each Gregorian month in a non-leap year.
const DAYS_BEFORE_MONTH = [
  0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
];

/**
 * A Gregorian date → the Solar Hijri (Jalali) one, the calendar Afghanistan uses: the year starts at Nowruz
 * (21 March, or 20 March before a leap year), the first six months have 31 days, the next five 30, and the last
 * 29 (30 in a leap year). Leap years follow the 33-year cycle, which agrees with the calendar for every date this
 * app can meet. 2026-11-01 is 10 Aqrab 1405.
 */
export function gregorianToSolar(
  gy: number,
  gm: number,
  gd: number,
): SolarDate {
  const afterEpoch = gy > 1600;
  let jy = afterEpoch ? 979 : 0;
  const year = afterEpoch ? gy - 1600 : gy - 621;
  // Whether February's extra day is already behind us decides which year's leap day to count.
  const counted = gm > 2 ? year + 1 : year;
  let days =
    365 * year +
    Math.floor((counted + 3) / 4) -
    Math.floor((counted + 99) / 100) +
    Math.floor((counted + 399) / 400) -
    80 +
    gd +
    DAYS_BEFORE_MONTH[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  // Truncating, not flooring: the first day of a cycle is day 0, and (0 - 1) / 365 must give 0, not -1.
  jy += Math.trunc((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  const month = (
    days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  ) as SolarMonth;
  const day = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { year: jy, month, day };
}

/** The Solar Hijri date of a timestamp as it is in Kabul (UTC+4:30), or null when the timestamp is unreadable. */
export function solarDateOf(iso: string | number): SolarDate | null {
  const time = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const d = new Date(time + KABUL_OFFSET_MS);
  return gregorianToSolar(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}

interface Options {
  /**
   * 'auto' (the default) writes the year only when it is not the current one: "۱۰ عقرب" now, "۱ حمل ۱۴۰۶" from the
   * year before. 'always' always writes it ("۱۰ عقرب ۱۴۰۵"), 'never' never does.
   */
  year?: 'auto' | 'always' | 'never';
  /** What "now" is, for the 'auto' year. Tests pass it; the app uses the clock. */
  now?: number;
}

/**
 * A timestamp as a Solar Hijri date in the reader's language: "۱۰ عقرب" or "۱۰ عقرب ۱۴۰۵" in Dari, with the Pashto
 * month names in Pashto (the names live in the translations, `date.months`). Empty when the timestamp is unreadable.
 */
export function formatSolarDate(
  iso: string | number,
  t: TFunction,
  { year = 'auto', now = Date.now() }: Options = {},
): string {
  const date = solarDateOf(iso);
  if (!date) return '';
  const current = solarDateOf(now);
  const withYear =
    year === 'always' || (year === 'auto' && current?.year !== date.year);
  const text = `${date.day} ${t(`date.months.${date.month}`)}${
    withYear ? ` ${date.year}` : ''
  }`;
  return toPersianDigits(text);
}
