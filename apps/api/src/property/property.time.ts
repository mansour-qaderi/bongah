import { KABUL_UTC_OFFSET_MS } from './property.constants.js';

function kabulMonthBoundary(now: Date, monthDelta: number): Date {
  const kabul = new Date(now.getTime() + KABUL_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(kabul.getUTCFullYear(), kabul.getUTCMonth() + monthDelta, 1) - KABUL_UTC_OFFSET_MS,
  );
}

/** The instant the current Kabul calendar month began. */
export function kabulMonthStart(now: Date): Date {
  return kabulMonthBoundary(now, 0);
}

/** The instant the next Kabul calendar month begins (when the free quota resets). */
export function nextKabulMonthStart(now: Date): Date {
  return kabulMonthBoundary(now, 1);
}
