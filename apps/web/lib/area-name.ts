import type { Language, Market, PlaceDetails } from '@bongah/shared-types';
import { AFGHANISTAN_BOUNDS, MARKET_CONFIG, MARKETS } from '@bongah/shared-types';
import { normalizePlaceName } from '@bongah/validation';
import { IRAN_PROVINCES, nearestProvince, PROVINCES, provinceLabel, type Province } from './provinces';

/** Below this zoom the view spans a province or more: the province is the honest name, and no geocoder is asked. */
export const AREA_MIN_ZOOM = 11;

export const insideAfghanistan = (lat: number, lng: number) =>
  lat >= AFGHANISTAN_BOUNDS.minLat && lat <= AFGHANISTAN_BOUNDS.maxLat && lng >= AFGHANISTAN_BOUNDS.minLng && lng <= AFGHANISTAN_BOUNDS.maxLng;

const inBox = (b: { minLat: number; maxLat: number; minLng: number; maxLng: number }, lat: number, lng: number) =>
  lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;

/**
 * Whether a point is inside a market's country, or inside either country when no market is given (a map view, a
 * geocoder answer: the point itself says which market it is in).
 */
export const insideMarket = (lat: number, lng: number, market?: Market): boolean =>
  market ? inBox(MARKET_CONFIG[market].bounds, lat, lng) : MARKETS.some((m) => inBox(MARKET_CONFIG[m].bounds, lat, lng));

/** One place in the cache and one question to the geocoder: about a kilometre, the size of a neighbourhood. */
export function areaKey(lat: number, lng: number, language: Language): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}:${language}`;
}

/** What a geocoder calls a province ("Kabul Province", "ولایت کابل", "کابل") → ours, or null. */
export function matchProvince(raw: string | null | undefined): Province | null {
  if (!raw) return null;
  const text = normalizePlaceName(raw)
    .replace(/\b(province|governorate)\b/gi, '')
    .replace(/^(ولایت|ولايت)\s+/u, '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  return (
    [...PROVINCES, ...IRAN_PROVINCES].find((p) =>
      [p.name, p.name_ps, p.capital, p.capital_ps, p.id].some((candidate) => candidate && normalizePlaceName(candidate).toLowerCase() === text),
    ) ?? null
  );
}

/**
 * The line shown on the map: «neighbourhood، district، province» as far as the geocoder knew it, and the province alone
 * when it knew nothing. The province is the geocoder's when it matches ours, else the nearest capital's.
 */
export function areaLabel(details: Pick<PlaceDetails, 'province' | 'district' | 'neighborhood'> | null, at: { lat: number; lng: number }, language: Language): string {
  const province = matchProvince(details?.province) ?? nearestProvince(at.lat, at.lng);
  const provinceName = provinceLabel(province, language);
  if (!details) return provinceName;
  const parts: string[] = [];
  const neighborhood = details.neighborhood?.trim();
  const district = details.district?.trim();
  if (neighborhood) parts.push(neighborhood);
  if (district && district !== neighborhood) parts.push(district);
  if (parts.length === 0) return provinceName;
  // «کابل، کابل»: a district named like its province is not said twice.
  if (parts[parts.length - 1] !== provinceName) parts.push(provinceName);
  return parts.join('، ');
}
