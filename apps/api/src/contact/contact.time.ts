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
