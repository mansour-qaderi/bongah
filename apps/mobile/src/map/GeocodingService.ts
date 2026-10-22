import type {
  GeoProvider,
  Language,
  PlaceDetails,
  PlaceSuggestion,
} from '@bongah/shared-types';
import { AFGHANISTAN_BOUNDS } from '@bongah/shared-types';
import { getAuthToken } from '../api/client';
import { geoAutocomplete, geoPlace, geoReverse } from '../api/endpoints';
import {
  GEOCODER_TIMEOUT_MS,
  GEOCODER_USER_AGENT,
  PHOTON_URL,
} from '../config';
import { matchProvince, type Province } from '../constants/provinces';
import { isInsideAfghanistan, type Coordinate } from './geo';
import { lookUpPlace, nearestProvince, type PlaceGuess } from './geocode';

/** Where a suggestion came from: one of the server's providers, or OpenStreetMap asked directly. */
export type PlaceSource = GeoProvider | 'osm';

/** One row of the "آدرس یا اسم مکان" dropdown. */
export interface PlaceOption {
  /** The provider's id (Google / Mapbox), or the OSM object for Photon. Unique within one list. */
  id: string;
  source: PlaceSource;
  title: string;
  subtitle: string;
  /** "hospital", "university", "cafe", "street", "city"…: picks the row's icon and how far the map zooms in. */
  category: string | null;
  /** Known up front for OpenStreetMap rows; a Google / Mapbox row is looked up when it is chosen. */
  coordinate: Coordinate | null;
}

export type SuggestResult =
  | { status: 'ok'; options: PlaceOption[] }
  /** Nobody could be asked (no network, every service down). The form still takes the text as written. */
  | { status: 'failed' };

/** A chosen place, ready for the map and the form. */
export interface ResolvedPlace {
  coordinate: Coordinate;
  zoom: number;
  title: string;
  /** The rest of its address, for the line under the field. */
  address: string;
  province: Province;
  /** True when the province is only the nearest capital (the provider did not name one we know). */
  provinceApproximate: boolean;
  district: string;
  neighborhood: string;
}

/** Fewer letters than this and every suggestion is noise (and every request a cost). */
export const MIN_QUERY_LENGTH = 2;
/** How many rows the dropdown shows. */
export const MAX_SUGGESTIONS = 8;

/**
 * A search session: Google and Mapbox bill the keystrokes of one search and the row picked from it as one request
 * when they carry the same token. A new one starts after each pick. (Hermes has no `crypto`; uniqueness is all that
 * matters here, not unpredictability.)
 */
export function newSearchSession(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(
    8 + Math.floor(Math.random() * 4)
  ).toString(16)}${hex(3)}-${hex(12)}`;
}

/** Places whose type means "an area", which the map shows from further out than a building. */
const AREA_ZOOMS: Readonly<Record<string, number>> = {
  administrative_area_level_1: 8,
  region: 8,
  state: 8,
  district: 11,
  administrative_area_level_2: 11,
  county: 11,
  locality: 12,
  place: 12,
  city: 12,
  town: 13,
  village: 14,
  neighborhood: 14,
  neighbourhood: 14,
  sublocality: 14,
  suburb: 14,
  street: 16,
  route: 16,
};
/** How far in to show a chosen place: a building at street level, a town or a province from further out. */
export const zoomForCategory = (category: string | null): number =>
  (category ? AREA_ZOOMS[category] : undefined) ?? 17;

// ───────────────────────────── OpenStreetMap: Photon ─────────────────────────────

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

const textOf = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** Photon's answer as dropdown rows: inside Afghanistan, named, no repeats, wide parts of the address as the subtitle. */
export function optionsFromPhoton(body: unknown): PlaceOption[] {
  const features = (body as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceOption[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates as unknown[];
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    const coordinate = { latitude, longitude };
    if (!isInsideAfghanistan(coordinate)) continue;
    const p = feature.properties ?? {};
    const street = [textOf(p.street), textOf(p.housenumber)]
      .filter(Boolean)
      .join(' ');
    const title = textOf(p.name) || street;
    if (!title) continue;
    const subtitleParts: string[] = [];
    for (const part of [
      street,
      textOf(p.district) || textOf(p.locality),
      textOf(p.city),
      textOf(p.county),
      textOf(p.state),
    ]) {
      if (part && part !== title && !subtitleParts.includes(part))
        subtitleParts.push(part);
    }
    const id = `${textOf(p.osm_type) || 'x'}${p.osm_id ?? out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // amenity=hospital → "hospital"; place=city → "city"; a plain street → "street".
    const category =
      textOf(p.osm_value) && !['yes', 'unclassified'].includes(p.osm_value!)
        ? textOf(p.osm_value)
        : textOf(p.type) || null;
    out.push({
      id,
      source: 'osm',
      title,
      subtitle: subtitleParts.join('، '),
      category: textOf(p.type) === 'street' ? 'street' : category,
      coordinate,
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** GET with a time limit that also stops when `signal` does; null on any failure. */
async function getJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), GEOCODER_TIMEOUT_MS);
  const stop = () => timeout.abort();
  signal?.addEventListener('abort', stop);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        'User-Agent': GEOCODER_USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

async function photonSuggest(
  query: string,
  near: Coordinate | undefined,
  signal?: AbortSignal,
): Promise<PlaceOption[] | null> {
  const b = AFGHANISTAN_BOUNDS;
  let url =
    `${PHOTON_URL}?q=${encodeURIComponent(query)}&limit=${
      MAX_SUGGESTIONS + 4
    }` + `&bbox=${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`;
  if (near) url += `&lat=${near.latitude}&lon=${near.longitude}`;
  const body = await getJson(url, signal);
  return body === null ? null : optionsFromPhoton(body);
}

// ───────────────────────────── the server (Google / Mapbox) ─────────────────────────────

const optionFromSuggestion = (s: PlaceSuggestion): PlaceOption => ({
  id: s.id,
  source: s.provider,
  title: s.title,
  subtitle: s.subtitle,
  category: s.category,
  coordinate:
    s.lat !== null && s.lng !== null
      ? { latitude: s.lat, longitude: s.lng }
      : null,
});

/** The server's place search can only be asked by someone signed in (it costs money per question). */
const canAskServer = () => getAuthToken() !== null;

/**
 * Suggestions for what has been typed so far. The server first (Google / Mapbox); when it has nothing or cannot be
 * asked, Photon. The caller waits for a short pause in the typing and passes a `signal` that aborts when the text
 * changes again, so a slow answer for "شفا" never replaces the one for "شفاخانه".
 */
export async function suggestPlaces(
  query: string,
  options: {
    near?: Coordinate;
    session?: string;
    language?: Language;
    signal?: AbortSignal;
  } = {},
): Promise<SuggestResult> {
  const text = query.replace(/\s+/g, ' ').trim();
  if (text.length < MIN_QUERY_LENGTH) return { status: 'ok', options: [] };
  const { near, session, language, signal } = options;

  let serverAnswered = false;
  if (canAskServer()) {
    try {
      const answer = await geoAutocomplete(
        {
          q: text,
          lat: near?.latitude,
          lng: near?.longitude,
          session,
          lang: language,
        },
        signal,
      );
      serverAnswered = true;
      const rows = answer.data
        .map(optionFromSuggestion)
        .slice(0, MAX_SUGGESTIONS);
      if (rows.length > 0) return { status: 'ok', options: rows };
    } catch {
      // No key on the server (503), throttled, offline: OpenStreetMap below.
    }
  }
  if (signal?.aborted) return { status: 'failed' };
  const osm = await photonSuggest(text, near, signal);
  if (osm !== null) return { status: 'ok', options: osm };
  return serverAnswered ? { status: 'ok', options: [] } : { status: 'failed' };
}

/** A province named by a provider ("Kabul", "ولایت نیمروز", "Nimroz Province"), or the nearest one to the point. */
function provinceFor(
  named: string | null | undefined,
  point: Coordinate,
): { province: Province; approximate: boolean } {
  const matched = matchProvince(named ?? undefined);
  return matched
    ? { province: matched, approximate: false }
    : { province: nearestProvince(point), approximate: true };
}

const fromDetails = (
  details: PlaceDetails,
  zoom: number,
  fallbackTitle: string,
): ResolvedPlace => {
  const coordinate = { latitude: details.lat, longitude: details.lng };
  const { province, approximate } = provinceFor(details.province, coordinate);
  return {
    coordinate,
    zoom,
    title: details.title || fallbackTitle,
    address: details.address,
    province,
    provinceApproximate: approximate,
    district: details.district ?? '',
    neighborhood: details.neighborhood ?? '',
  };
};

/**
 * Where a chosen row is. OpenStreetMap rows already know; a Google / Mapbox row is asked for (same session, so the
 * search and the pick are billed once). Null when it can no longer be found or nobody could be asked.
 */
export async function resolvePlace(
  option: PlaceOption,
  {
    session,
    language,
    signal,
  }: { session?: string; language?: Language; signal?: AbortSignal } = {},
): Promise<ResolvedPlace | null> {
  const zoom = zoomForCategory(option.category);
  if (option.coordinate) {
    if (!isInsideAfghanistan(option.coordinate)) return null;
    // The subtitle ends with the widest part Photon knew, usually the province ("…، نیمروز").
    const parts = option.subtitle.split('، ');
    const { province, approximate } = provinceFor(
      parts[parts.length - 1],
      option.coordinate,
    );
    return {
      coordinate: option.coordinate,
      zoom,
      title: option.title,
      address: option.subtitle,
      province,
      provinceApproximate: approximate,
      district: '',
      neighborhood: '',
    };
  }
  if (option.source === 'osm') return null;
  try {
    const details = await geoPlace(
      option.source,
      option.id,
      { session, lang: language },
      signal,
    );
    const coordinate = { latitude: details.lat, longitude: details.lng };
    if (!isInsideAfghanistan(coordinate)) return null;
    return fromDetails(details, zoom, option.title);
  } catch {
    return null;
  }
}

/**
 * What is at a spot (a pin, the middle of a drawn plot), for filling in the form. The server first, because Google
 * names streets and areas OpenStreetMap leaves blank; Nominatim when it cannot answer or knows nothing (it may still
 * know the district). Same shape and the same "never throws" promise as `lookUpPlace`.
 */
export async function describeSpot(
  point: Coordinate,
  { language, signal }: { language?: Language; signal?: AbortSignal } = {},
): Promise<PlaceGuess> {
  let fromServer: PlaceGuess | null = null;
  if (canAskServer()) {
    try {
      const details = await geoReverse(
        { lat: point.latitude, lng: point.longitude, lang: language },
        signal,
      );
      const { province, approximate } = provinceFor(details.province, point);
      fromServer = {
        answered: true,
        province,
        provinceApproximate: approximate,
        district: details.district ?? '',
        neighborhood: details.neighborhood ?? '',
        street: details.street ?? '',
      };
      if (fromServer.district || fromServer.neighborhood || fromServer.street)
        return fromServer;
    } catch {
      // 404 (nothing known), 503 (no key), offline: ask OpenStreetMap.
    }
  }
  const osm = await lookUpPlace(point, signal);
  // The server named only the province: better than OpenStreetMap knowing nothing at all.
  return !osm.answered && fromServer ? fromServer : osm;
}
