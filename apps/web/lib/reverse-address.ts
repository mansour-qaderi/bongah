import type { Language, PlaceDetails } from '@bongah/shared-types';
import { addressFrom } from './address';
import { insideMarket, matchProvince } from './area-name';
import { nearestProvince } from './provinces';

/**
 * "What is at the spot the person pressed?": the answer fills the form's province, district, neighbourhood and address,
 * so the agent only corrects what the map got wrong instead of typing it all.
 *
 * Two rules keep it from being a nuisance:
 *   1. It never overwrites what the person wrote. A field is filled only while it is empty or still holds what the
 *      previous lookup put there (so moving the pin a few streets over updates the line, and an address the agent
 *      edited by hand stays theirs).
 *   2. It never gets in the way: no answer (offline, nothing known there) leaves the form exactly as it was.
 */

export interface FormAddress {
  /** The province as the form's select keeps it (the Dari name). */
  province: string;
  district: string;
  neighborhood: string;
  address: string;
}

/** What the previous lookup wrote, field by field (a field is absent once the person changed it). */
export type AutoFilled = Partial<FormAddress>;

export interface FillPlan {
  /** The fields to set. */
  patch: Partial<FormAddress>;
  /** What the form's auto-filled fields now hold (pass it as `before` to the next plan). */
  filled: AutoFilled;
  /** The address line the spot has, for showing under the map (also when nothing could be written). */
  line: string;
  /** The province is only the nearest capital, because the geocoder named none that we know. */
  provinceGuessed: boolean;
  /** Whether the answer said anything about the place at all. */
  found: boolean;
}

type PlaceParts = Pick<PlaceDetails, 'province' | 'district' | 'neighborhood' | 'street'>;

const text = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** What to write into the form for the answer, given what the form holds now and what the last lookup wrote. Pure. */
export function planFill(place: PlaceParts | null, current: FormAddress, before: AutoFilled, at: { lat: number; lng: number }): FillPlan {
  const district = text(place?.district);
  const neighborhood = text(place?.neighborhood);
  const street = text(place?.street);
  const matched = matchProvince(place?.province);
  const found = !!(district || neighborhood || street || matched);
  if (!place || !found) return { patch: {}, filled: { ...before }, line: '', provinceGuessed: false, found: false };

  const mayWrite = (field: keyof FormAddress): boolean => {
    const now = current[field].trim();
    return now === '' || now === before[field];
  };

  const patch: Partial<FormAddress> = {};
  const filled: AutoFilled = { ...before };
  // A field the person has changed since the last lookup is theirs: it stops being "auto" for good.
  for (const field of ['province', 'district', 'neighborhood', 'address'] as const) {
    if (filled[field] !== undefined && current[field].trim() !== filled[field]) delete filled[field];
  }

  const set = (field: keyof FormAddress, value: string) => {
    if (!value || !mayWrite(field)) return;
    // Already what the form says (a value the person typed too): nothing to write, and it stays theirs.
    if (current[field].trim() === value) return;
    patch[field] = value;
    filled[field] = value;
  };

  // The province: the geocoder's when it is one of ours, else the nearest capital (only into an empty field, and flagged).
  let provinceGuessed = false;
  let provinceValue = current.province.trim();
  if (matched) {
    set('province', matched.name);
    if (patch.province) provinceValue = matched.name;
  } else if (!provinceValue && insideMarket(at.lat, at.lng)) {
    const nearest = nearestProvince(at.lat, at.lng);
    set('province', nearest.name);
    if (patch.province) {
      provinceValue = nearest.name;
      provinceGuessed = true;
    }
  }
  set('district', district);
  set('neighborhood', neighborhood);

  // The whole line, wide to narrow, from what the form will hold after this (province first, as the form writes it).
  const nextDistrict = patch.district ?? current.district.trim();
  const nextNeighborhood = patch.neighborhood ?? current.neighborhood.trim();
  const line = addressFrom({ province: provinceValue, district: nextDistrict, neighborhood: nextNeighborhood, street });
  const onlyProvince = line === provinceValue;
  if (!onlyProvince) set('address', line);

  return { patch, filled, line: onlyProvince ? '' : line, provinceGuessed, found: true };
}

// ───────────────────────────── asking ─────────────────────────────

const GEOCODE_REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

interface MapboxContext {
  region?: { name?: string };
  district?: { name?: string };
  place?: { name?: string };
  locality?: { name?: string };
  neighborhood?: { name?: string };
  street?: { name?: string };
}

/** The same parts the server's Mapbox backend reads from a Geocoding v6 answer (apps/api/src/geo/mapbox.backend.ts). */
export function partsFromMapbox(body: unknown): PlaceParts | null {
  const feature = (body as { features?: Array<{ properties?: { context?: MapboxContext } }> } | null)?.features?.[0];
  const context = feature?.properties?.context;
  if (!context) return null;
  const name = (part?: { name?: string }) => text(part?.name) || null;
  return {
    province: name(context.region),
    district: name(context.district) ?? name(context.place),
    neighborhood: name(context.neighborhood) ?? name(context.locality),
    street: name(context.street),
  };
}

/** Where the answer came from, for the status line. */
export interface PlaceAnswer {
  place: PlaceParts | null;
  source: 'server' | 'mapbox' | 'none';
}

export interface LookupOptions {
  language: Language;
  /** The public Mapbox token, for asking Mapbox directly when the server cannot answer. */
  token: string;
  signal?: AbortSignal;
  /** The server's reverse geocoder (GET geo/reverse): throws when it cannot answer; resolves null when nothing is known there. */
  server: (point: { lat: number; lng: number }, language: Language, signal?: AbortSignal) => Promise<PlaceDetails | null>;
  fetchImpl?: typeof fetch;
}

/**
 * What is at a spot. The server first (it may use Google, which names streets Mapbox leaves blank); Mapbox's own
 * geocoder, with the same public token the map uses, when the server cannot answer (no key there, offline, the
 * request limit). A spot the server answered "nothing known" for is not asked again elsewhere. Never throws.
 */
export async function lookupPlace(point: { lat: number; lng: number }, options: LookupOptions): Promise<PlaceAnswer> {
  const { language, token, signal, server, fetchImpl = fetch } = options;
  if (!insideMarket(point.lat, point.lng)) return { place: null, source: 'none' };
  try {
    const answer = await server(point, language, signal);
    return answer ? { place: answer, source: 'server' } : { place: null, source: 'none' };
  } catch {
    if (signal?.aborted) return { place: null, source: 'none' };
  }
  if (!token) return { place: null, source: 'none' };
  try {
    const params = new URLSearchParams({
      longitude: String(point.lng),
      latitude: String(point.lat),
      language: language === 'ps' ? 'ps' : 'fa',
      country: 'af,ir', // the point decides which: both countries are served
      limit: '1',
      access_token: token,
    });
    const res = await fetchImpl(`${GEOCODE_REVERSE_URL}?${params}`, { signal });
    if (!res.ok) return { place: null, source: 'none' };
    const place = partsFromMapbox(await res.json());
    return place ? { place, source: 'mapbox' } : { place: null, source: 'none' };
  } catch {
    return { place: null, source: 'none' };
  }
}
