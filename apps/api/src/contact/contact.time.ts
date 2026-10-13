import { KABUL_UTC_OFFSET_MS } from '../property/property.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Kabul calendar date of `now`, as the UTC-midnight Date a Postgres DATE column stores
 * (time zones play no part once it is a plain date). 23:59 Kabul and 00:01 Kabul are different days
 * even though they fall on the same UTC date.
 */
export function kabulDayKey(now: Date): Date {
  const kabul = new Date(now.getTime() + KABUL_UTC_OFFSET_MS);
  return new Date(Date.UTC(kabul.getUTCFullYear(), kabul.getUTCMonth(), kabul.getUTCDate()));
}

/** The instant the next Kabul calendar day begins (when the free reveals refill). */
export function nextKabulMidnight(now: Date): Date {
  return new Date(kabulDayKey(now).getTime() + DAY_MS - KABUL_UTC_OFFSET_MS);
}

/** Kabul dates (YYYY-MM-DD), oldest first: `days` of them ending at `lastDay` (a UTC-midnight Date from kabulDayKey). */
export function kabulDayList(lastDay: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    new Date(lastDay.getTime() - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  );
}

/** The instant a Kabul calendar date (YYYY-MM-DD) begins. */
export function kabulDayStart(day: string): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - KABUL_UTC_OFFSET_MS);
}
