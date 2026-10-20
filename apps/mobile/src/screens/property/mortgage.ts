import type { TFunction } from 'i18next';
import { MORTGAGE_MONTHS_MAX } from '@bongah/shared-types';
import { formatNumber, parseNumberInput } from '../../i18n/format';

/** The unit the owner counts the mortgage in. The server only knows months. */
export type DurationUnit = 'month' | 'year';

/**
 * The mortgage length typed on the form, in whole months. `'empty'` when nothing (or something that is not a number)
 * was typed, `'invalid'` for a number that cannot be a length: zero, more than the longest mortgage, or a part of a
 * month ("۱٫۵ ماه"). Years may be fractional ("۱٫۵ سال" is 18 months) as long as they come to whole months.
 */
export function monthsFromInput(
  text: string,
  unit: DurationUnit,
): number | 'empty' | 'invalid' {
  if (text.trim() === '') return 'empty';
  const value = parseNumberInput(text);
  if (value === null) return 'empty';
  const months = unit === 'year' ? value * 12 : value;
  // 0.1 year is 1.2 months: not a whole month, and a length of "about" is not a length.
  if (Math.abs(months - Math.round(months)) > 1e-9) return 'invalid';
  const whole = Math.round(months);
  return whole >= 1 && whole <= MORTGAGE_MONTHS_MAX ? whole : 'invalid';
}

/** How a stored length is written back into the form: whole years when it is a round number of them. */
export function splitMonths(months: number | null | undefined): {
  text: string;
  unit: DurationUnit;
} {
  if (!months) return { text: '', unit: 'month' };
  if (months % 12 === 0) return { text: String(months / 12), unit: 'year' };
  return { text: String(months), unit: 'month' };
}

/** "۶ ماه", "۲ سال", "۲ سال و ۶ ماه": a stored length said the way a person would say it. */
export function durationLabel(months: number, t: TFunction): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0)
    return t('mortgage.months', { count: formatNumber(months, 0) });
  if (rest === 0) return t('mortgage.years', { count: formatNumber(years, 0) });
  return t('mortgage.yearsMonths', {
    years: formatNumber(years, 0),
    months: formatNumber(rest, 0),
  });
}
