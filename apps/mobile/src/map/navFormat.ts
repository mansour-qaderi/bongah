import type { TFunction } from 'i18next';
import { formatNumber } from '../i18n/format';
import { kmh } from './useLiveLocation';

/**
 * The navigation HUD's numbers, the way a driver reads them in Dari or Pashto: "۴٫۲ کیلومتر", "۸۰۰ متر",
 * "۸ دقیقه", "۱ ساعت و ۵ دقیقه", "۴۵ km/h". Persian digits throughout.
 */

/** Metres: under a kilometre in tens of metres, then kilometres with one decimal (whole kilometres past 100). */
export function formatDistance(metres: number, t: TFunction): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  if (metres < 1000) {
    const rounded = metres < 100 ? Math.round(metres / 5) * 5 : Math.round(metres / 10) * 10;
    // 995 m rounds to 1000: say "1 km" rather than "1000 m".
    if (rounded < 1000) return t('route.m', { value: formatNumber(rounded, 0) });
  }
  const km = metres / 1000;
  return t('route.km', { value: formatNumber(km, km >= 100 ? 0 : 1) });
}

/** Seconds to arrival, in whole minutes (rounded up: "1 minute" while any time is left), hours past the hour. */
export function formatEta(seconds: number, t: TFunction): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return t('route.underMinute');
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t('route.min', { value: formatNumber(minutes, 0) });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0
    ? t('route.hours', { h: formatNumber(h, 0) })
    : t('route.hourMin', { h: formatNumber(h, 0), m: formatNumber(m, 0) });
}

/** m/s → "۴۵ km/h"; "–" until the speed is known. */
export function formatSpeed(metresPerSecond: number | null, t: TFunction): string {
  if (metresPerSecond === null || !Number.isFinite(metresPerSecond)) return '–';
  return t('route.kmh', { value: formatNumber(kmh(metresPerSecond), 0) });
}
