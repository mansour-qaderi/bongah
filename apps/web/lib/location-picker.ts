import { AFGHANISTAN_BOUNDS } from '@bongah/shared-types';
import { insideAfghanistan } from './area-name';
import { parseLatLng } from './import/draft-validation';
import { PROVINCES, type Province } from './provinces';

/** What the picker hands the form: both numbers as text (the form keeps them as typed text), or null for "no pin". */
export interface PickedPosition {
  lat: string;
  lng: string;
}

export interface MapView {
  /** [longitude, latitude], as Mapbox wants it. */
  center: [number, number];
  zoom: number;
}

/** The whole country in one view: where the picker starts while no province is chosen. */
export const COUNTRY_VIEW: MapView = { center: [66.2, 33.9], zoom: 4.6 };
/** A provincial capital, close enough to see its districts. */
export const PROVINCE_ZOOM = 11;
/** A district, close enough to see its streets. */
export const DISTRICT_ZOOM = 13;
/** A pin that was set, shown at a zoom where its street is readable. */
export const PIN_ZOOM = 16;

/** Six decimals is about 10 cm: more is noise, and the API stores no more than this. */
export const roundCoordinate = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A position as the form's text fields hold it. Null when it is not inside Afghanistan (the API refuses those). */
export function toPicked(lat: number, lng: number): PickedPosition | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !insideAfghanistan(lat, lng)) return null;
  return { lat: String(roundCoordinate(lat)), lng: String(roundCoordinate(lng)) };
}

/** The pin the form's two text fields describe, or null while either is empty or unreadable (or outside the country). */
export function pinOf(lat: string, lng: string): { lat: number; lng: number } | null {
  const la = parseLatLng(lat.trim());
  const ln = parseLatLng(lng.trim());
  if (la === null || ln === null || !insideAfghanistan(la, ln)) return null;
  return { lat: la, lng: ln };
}

/** The province a stored name (Dari, as the form's select keeps it) stands for. */
export function provinceByName(name: string): Province | null {
  const wanted = name.trim();
  return wanted ? (PROVINCES.find((p) => p.name === wanted) ?? null) : null;
}

/** Where the map should look for a province: its capital, at city zoom. Null while no (known) province is chosen. */
export function provinceView(name: string): MapView | null {
  const province = provinceByName(name);
  return province ? { center: [province.lng, province.lat], zoom: PROVINCE_ZOOM } : null;
}

/** Where the map starts: the pin, else the province, else the country. */
export function startView(pin: { lat: number; lng: number } | null, provinceName: string): MapView {
  if (pin) return { center: [pin.lng, pin.lat], zoom: PIN_ZOOM };
  return provinceView(provinceName) ?? COUNTRY_VIEW;
}

// ───────────────────────────── finding a district ─────────────────────────────

/** A district farther than this (in degrees, about 160 km) from its province's capital is a different place with the same name. */
const MAX_DISTRICT_DISTANCE = 1.5;

const DISTRICT_PREFIX = /^(ولسوالی|ولسوالۍ|ناحیه|ناحیې|ښارګوټی|شهرک)\s+/u;

/** The question for the geocoder: «district، province»; the administrative prefix is dropped (the maps write «پغمان», not «ولسوالی پغمان»). */
export function districtQuery(district: string, province: string): string | null {
  const written = district.replace(/\s+/g, ' ').trim();
  const stripped = written.replace(DISTRICT_PREFIX, '');
  // «ناحیه ۴» is a numbered district: without its word the number alone names nothing.
  const name = /\p{L}/u.test(stripped) ? stripped : written;
  if (name.length < 2) return null;
  return [name, province.trim(), 'افغانستان'].filter(Boolean).join('، ');
}

interface GeocodeFeature {
  geometry?: { coordinates?: unknown };
}

/** The first answer that is inside the country and not far from the province: [lng, lat], or null. */
export function pickDistrictAnswer(features: readonly GeocodeFeature[], province: Province | null): [number, number] | null {
  for (const feature of features) {
    const c = feature.geometry?.coordinates;
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const [lng, lat] = c as [number, number];
    if (!insideAfghanistan(lat, lng)) continue;
    if (province && (Math.abs(province.lat - lat) > MAX_DISTRICT_DISTANCE || Math.abs(province.lng - lng) > MAX_DISTRICT_DISTANCE)) continue;
    return [lng, lat];
  }
  return null;
}

const GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const answers = new Map<string, [number, number] | null>();

/**
 * Where a district is, from Mapbox's geocoder (the same public token as the map). Answers are remembered, and any failure
 * (offline, a token without the geocoding scope, nothing found) is "not found": the map simply stays on the province.
 */
export async function findDistrict(
  district: string,
  provinceName: string,
  token: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<[number, number] | null> {
  const q = districtQuery(district, provinceName);
  if (!q || !token) return null;
  const province = provinceByName(provinceName);
  const key = q;
  if (answers.has(key)) return answers.get(key)!;
  const params = new URLSearchParams({
    q,
    country: 'af',
    language: 'fa',
    limit: '3',
    types: 'district,locality,neighborhood,place',
    bbox: [AFGHANISTAN_BOUNDS.minLng, AFGHANISTAN_BOUNDS.minLat, AFGHANISTAN_BOUNDS.maxLng, AFGHANISTAN_BOUNDS.maxLat].join(','),
    access_token: token,
  });
  if (province) params.set('proximity', `${province.lng},${province.lat}`);
  try {
    const res = await fetchImpl(`${GEOCODE_URL}?${params}`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: GeocodeFeature[] };
    const hit = pickDistrictAnswer(body.features ?? [], province);
    if (answers.size >= 200) answers.delete(answers.keys().next().value as string);
    answers.set(key, hit);
    return hit;
  } catch {
    return null; // aborted or offline: not remembered, so the next try asks again
  }
}

/** For tests: forget what was found. */
export const forgetDistricts = () => answers.clear();
