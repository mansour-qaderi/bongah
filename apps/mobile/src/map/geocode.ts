import {
  GEOCODER_SEARCH_URL,
  GEOCODER_TIMEOUT_MS,
  GEOCODER_URL,
  GEOCODER_USER_AGENT,
} from '../config';
import {
  matchProvince,
  PROVINCES,
  type Province,
} from '../constants/provinces';
import { isInsideAfghanistan, type Coordinate } from './geo';

/** What a spot on the map says about where it is. Anything the service did not know is an empty string. */
export interface PlaceGuess {
  province: Province | null;
  /**
   * True when the province is only the nearest provincial capital, because the service gave no usable answer.
   * A province is a big area, so near a border that can be wrong: the form says so and lets the person fix it.
   */
  provinceApproximate: boolean;
  district: string;
  neighborhood: string;
  street: string;
  /**
   * True when the service actually described the spot. False when it could not be asked or knew nothing (the
   * province is then only the nearest capital), so the form can say "write the address yourself".
   */
  answered: boolean;
}

/** The province whose capital is closest to a point. A fallback for when no service can be asked. */
export function nearestProvince(point: Coordinate): Province {
  // Longitude degrees shrink with latitude; this is plenty accurate for ranking 34 places.
  const scale = Math.cos((point.latitude * Math.PI) / 180);
  let best = PROVINCES[0];
  let bestDistance = Infinity;
  for (const province of PROVINCES) {
    const dLat = province.lat - point.latitude;
    const dLng = (province.lng - point.longitude) * scale;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      best = province;
      bestDistance = distance;
    }
  }
  return best;
}

interface NominatimAddress {
  [key: string]: string | undefined;
}

const first = (address: NominatimAddress, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = address[key]?.trim();
    if (value) return value;
  }
  return '';
};

/** Reads the parts of a Nominatim reverse-geocoding answer the listing form has fields for. */
export function placeFromAddress(
  address: NominatimAddress | undefined,
  point: Coordinate,
): PlaceGuess {
  if (!address) return fallback(point);
  const matched = matchProvince(address.state ?? address.region);
  return {
    answered: true,
    province: matched ?? nearestProvince(point),
    provinceApproximate: matched === null,
    district: first(address, [
      'county',
      'city_district',
      'district',
      'city',
      'town',
      'municipality',
      'village',
    ]),
    neighborhood: first(address, [
      'neighbourhood',
      'quarter',
      'suburb',
      'hamlet',
    ]),
    street: first(address, ['road', 'pedestrian', 'residential']),
  };
}

const fallback = (point: Coordinate): PlaceGuess => ({
  answered: false,
  province: nearestProvince(point),
  provinceApproximate: true,
  district: '',
  neighborhood: '',
  street: '',
});

/**
 * Asks the geocoder what is at `point`. Never throws: a slow or missing network, a bad answer or a spot the
 * service knows nothing about all come back as "the nearest province and nothing else", because the form works
 * perfectly well with the person typing the rest.
 */
export async function lookUpPlace(
  point: Coordinate,
  signal?: AbortSignal,
): Promise<PlaceGuess> {
  const url =
    `${GEOCODER_URL}?format=jsonv2&addressdetails=1&zoom=17` +
    `&accept-language=fa,ps,en&lat=${point.latitude}&lon=${point.longitude}`;
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
    if (!response.ok) return fallback(point);
    const body = (await response.json()) as { address?: NominatimAddress };
    return placeFromAddress(body.address, point);
  } catch {
    return fallback(point);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

// ───────────────────── the other way round: a written address → a spot on the map ─────────────────────

/** Where a written address is, and how far in the map should zoom to show it. */
export type AddressSearch =
  | { status: 'found'; coordinate: Coordinate; zoom: number }
  | { status: 'none' }
  | { status: 'failed' };

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 6;
const MAX_ZOOM = 17;

/**
 * How far in to zoom to show a box about as wide as `span` degrees on a phone-sized map. A 512-px world tile covers
 * 360 degrees at zoom 0 and half as much for each step in, and a phone is a little under one tile wide, so the box
 * fills the screen at about log2(350 / span). Clamped so a tiny box does not zoom past the tiles and a whole province
 * still shows something.
 */
export function zoomForSpan(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return DEFAULT_ZOOM;
  return Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.round(Math.log2(350 / span))),
  );
}

interface SearchHit {
  lat?: string;
  lon?: string;
  /** [south, north, west, east] as text. */
  boundingbox?: string[];
}

/** The first usable hit of a Nominatim search answer: inside Afghanistan, with a zoom that fits its box. */
export function addressFromHits(body: unknown): AddressSearch {
  if (!Array.isArray(body)) return { status: 'failed' };
  for (const hit of body as SearchHit[]) {
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const coordinate = { latitude, longitude };
    if (!isInsideAfghanistan(coordinate)) continue;
    const box = hit.boundingbox?.map(Number);
    const span =
      box && box.length === 4 && box.every(Number.isFinite)
        ? Math.max(Math.abs(box[1] - box[0]), Math.abs(box[3] - box[2]))
        : 0;
    return { status: 'found', coordinate, zoom: zoomForSpan(span) };
  }
  return { status: 'none' };
}

/**
 * Asks where a written address is (for example "زرنج، ناحیه ۵، پهلوی شفاخانه"), only inside Afghanistan, and takes the
 * best answer. Never throws: a slow or missing network or a bad answer is `failed`, told apart from `none` ("the
 * service has never heard of it") so the form can say the right thing.
 *
 * The caller waits for the person to stop typing before asking: the shared geocoder allows about one request a second
 * (see config.ts).
 */
export async function findAddress(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSearch> {
  const text = query.trim();
  if (!text) return { status: 'none' };
  const url =
    `${GEOCODER_SEARCH_URL}?format=jsonv2&addressdetails=0&countrycodes=af&limit=3` +
    `&accept-language=fa,ps,en&q=${encodeURIComponent(text)}`;
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
    if (!response.ok) return { status: 'failed' };
    return addressFromHits(await response.json());
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}
