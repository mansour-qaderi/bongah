import {
  GEOCODER_GAP_MS,
  GEOCODER_SEARCH_URL,
  GEOCODER_TIMEOUT_MS,
  GEOCODER_URL,
  GEOCODER_USER_AGENT,
} from '../config';
import {
  ALL_PROVINCES,
  matchProvince,
  provincesFor,
  type Province,
} from '../constants/provinces';
import { DEFAULT_MARKET, MARKET_CONFIG, type Market } from '@bongah/shared-types';
import { isInsideMarket, type Coordinate } from './geo';

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

/**
 * The province whose capital is closest to a point. A fallback for when no service can be asked. With a market, only
 * that country's provinces are looked at; without one, the closest capital of either country (the point says which).
 */
export function nearestProvince(point: Coordinate, market?: Market): Province {
  const list = market ? provincesFor(market) : ALL_PROVINCES;
  // Longitude degrees shrink with latitude; this is plenty accurate for ranking 34 places.
  const scale = Math.cos((point.latitude * Math.PI) / 180);
  let best = list[0];
  let bestDistance = Infinity;
  for (const province of list) {
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

/**
 * The ISO 3166-2 code Nominatim attaches to a province ("AF-KAB"), by the province's id. A province's name comes back
 * in whatever language the map data has ("Kabul Province", "ولایت کابل", or only a district), while this code is
 * always the same, so it is the fallback when the name does not match.
 */
const ISO_PROVINCE_IDS: Readonly<Record<string, string>> = {
  'AF-KAB': 'kabul',
  'AF-HER': 'herat',
  'AF-BAL': 'balkh',
  'AF-KAN': 'kandahar',
  'AF-NAN': 'nangarhar',
  'AF-KDZ': 'kunduz',
  'AF-GHA': 'ghazni',
  'AF-BAM': 'bamyan',
  'AF-BDS': 'badakhshan',
  'AF-TAK': 'takhar',
  'AF-BGL': 'baghlan',
  'AF-PAR': 'parwan',
  'AF-KAP': 'kapisa',
  'AF-PAN': 'panjshir',
  'AF-LOG': 'logar',
  'AF-WAR': 'wardak',
  'AF-PIA': 'paktia',
  'AF-PKA': 'paktika',
  'AF-KHO': 'khost',
  'AF-LAG': 'laghman',
  'AF-KNR': 'kunar',
  'AF-NUR': 'nuristan',
  'AF-SAM': 'samangan',
  'AF-SAR': 'sar-e-pol',
  'AF-JOW': 'jawzjan',
  'AF-FYB': 'faryab',
  'AF-BDG': 'badghis',
  'AF-GHO': 'ghor',
  'AF-DAY': 'daykundi',
  'AF-URU': 'uruzgan',
  'AF-ZAB': 'zabul',
  'AF-HEL': 'helmand',
  'AF-NIM': 'nimroz',
  'AF-FRA': 'farah',
  // Iran (ISO 3166-2:IR)
  'IR-01': 'east-azerbaijan',
  'IR-02': 'west-azerbaijan',
  'IR-03': 'ardabil',
  'IR-04': 'isfahan',
  'IR-05': 'ilam',
  'IR-06': 'bushehr',
  'IR-07': 'tehran',
  'IR-08': 'chaharmahal',
  'IR-10': 'khuzestan',
  'IR-11': 'zanjan',
  'IR-12': 'semnan',
  'IR-13': 'sistan-baluchestan',
  'IR-14': 'fars',
  'IR-15': 'kerman',
  'IR-16': 'kurdistan',
  'IR-17': 'kermanshah',
  'IR-18': 'kohgiluyeh',
  'IR-19': 'gilan',
  'IR-20': 'lorestan',
  'IR-21': 'mazandaran',
  'IR-22': 'markazi',
  'IR-23': 'hormozgan',
  'IR-24': 'hamadan',
  'IR-25': 'yazd',
  'IR-26': 'qom',
  'IR-27': 'golestan',
  'IR-28': 'qazvin',
  'IR-29': 'south-khorasan',
  'IR-30': 'khorasan-razavi',
  'IR-31': 'north-khorasan',
  'IR-32': 'alborz',
};

/** The province an ISO 3166-2 code ("AF-KAB", any case) names, or null. */
export function provinceFromIsoCode(code: string | undefined): Province | null {
  const id = code ? ISO_PROVINCE_IDS[code.trim().toUpperCase()] : undefined;
  return ALL_PROVINCES.find(p => p.id === id) ?? null;
}

/**
 * The province an address answer is in. The service files the province under "state" most of the time, but a place in
 * Afghanistan often has it under "region" or "state_district" instead, or only as the ISO code, so each is tried in
 * turn instead of the first one present deciding. (A "county" is a district, never a province, and is not tried.)
 */
function provinceOf(address: NominatimAddress): Province | null {
  return (
    matchProvince(address.state) ??
    matchProvince(address.region) ??
    matchProvince(address.state_district) ??
    provinceFromIsoCode(address['ISO3166-2-lvl4']) ??
    provinceFromIsoCode(address['ISO3166-2-lvl3'])
  );
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
  market?: Market,
): PlaceGuess {
  if (!address) return fallback(point, market);
  const matched = provinceOf(address);
  return {
    answered: true,
    province: matched ?? nearestProvince(point, market),
    provinceApproximate: matched === null,
    district: first(address, [
      'county',
      'city_district',
      'district',
      'state_district',
      'city',
      'town',
      'municipality',
      'village',
    ]),
    neighborhood: first(address, [
      'neighbourhood',
      'quarter',
      'suburb',
      'city_block',
      'hamlet',
      'locality',
    ]),
    street: first(address, ['road', 'pedestrian', 'residential']),
  };
}

/** Whether an answer says anything about the spot beyond a province. */
const isDescriptive = (place: PlaceGuess): boolean =>
  Boolean(place.district || place.neighborhood || place.street);

const fallback = (point: Coordinate, market?: Market): PlaceGuess => ({
  answered: false,
  province: nearestProvince(point, market),
  provinceApproximate: true,
  district: '',
  neighborhood: '',
  street: '',
});

/** Reverse lookup at street level first; a town or district level when that finds nothing to say. */
const REVERSE_ZOOMS = [17, 13] as const;

/** Waits `ms`, or less if `signal` is aborted meanwhile (the caller then checks the signal itself). */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

/** One question to the geocoder, with its own time limit; null when it could not be asked or did not answer. */
async function ask(url: string, signal?: AbortSignal): Promise<unknown | null> {
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

/**
 * Asks the geocoder what is at `point`. Never throws: a slow or missing network, a bad answer or a spot the
 * service knows nothing about all come back as "the nearest province and nothing else", because the form works
 * perfectly well with the person typing the rest.
 *
 * Much of Afghanistan is mapped coarsely: asked at street level, the service often answers a spot with nothing but
 * the country. So when the first answer names no place at all, the same spot is asked again at district level, and
 * the better answer is used. (Only when the service answered; a network that failed is not asked twice.)
 */
export async function lookUpPlace(
  point: Coordinate,
  signal?: AbortSignal,
  market?: Market,
): Promise<PlaceGuess> {
  let best: PlaceGuess | null = null;
  for (const zoom of REVERSE_ZOOMS) {
    if (best) {
      await pause(GEOCODER_GAP_MS, signal);
      if (signal?.aborted) break;
    }
    const url =
      `${GEOCODER_URL}?format=jsonv2&addressdetails=1&zoom=${zoom}` +
      `&accept-language=fa,ps,en&lat=${point.latitude}&lon=${point.longitude}`;
    const body = (await ask(url, signal)) as {
      address?: NominatimAddress;
    } | null;
    // Could not be asked: nothing a second question would change.
    if (body === null) return best ?? fallback(point, market);
    const place = placeFromAddress(body.address, point, market);
    if (!best || (place.answered && (!best.answered || isDescriptive(place))))
      best = place;
    if (isDescriptive(best)) break;
  }
  return best ?? fallback(point, market);
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

/** The first usable hit of a Nominatim search answer: inside the market's country, with a zoom that fits its box. */
export function addressFromHits(
  body: unknown,
  market: Market = DEFAULT_MARKET,
): AddressSearch {
  if (!Array.isArray(body)) return { status: 'failed' };
  for (const hit of body as SearchHit[]) {
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const coordinate = { latitude, longitude };
    if (!isInsideMarket(coordinate, market)) continue;
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
 * Asks where a written address is (for example "زرنج، ناحیه ۵، پهلوی شفاخانه"), only inside the market's country, and takes the
 * best answer. Never throws: a slow or missing network or a bad answer is `failed`, told apart from `none` ("the
 * service has never heard of it") so the form can say the right thing.
 *
 * The caller waits for the person to stop typing before asking: the shared geocoder allows about one request a second
 * (see config.ts).
 */
export async function findAddress(
  query: string,
  signal?: AbortSignal,
  market: Market = DEFAULT_MARKET,
): Promise<AddressSearch> {
  const text = query.trim();
  if (!text) return { status: 'none' };
  const url =
    `${GEOCODER_SEARCH_URL}?format=jsonv2&addressdetails=0&countrycodes=${MARKET_CONFIG[market].country.toLowerCase()}&limit=3` +
    `&accept-language=fa,ps,en&q=${encodeURIComponent(text)}`;
  const body = await ask(url, signal);
  return body === null ? { status: 'failed' } : addressFromHits(body, market);
}

// ───────────────── a written address that is more than the map knows: ask for less and less ─────────────────

/** Most questions one written address may cost: the shared geocoder is for a person, not for a loop. */
export const MAX_ADDRESS_QUERIES = 4;

/**
 * The questions to ask the geocoder for one written address, most specific first. An address in Afghanistan is
 * written wide to narrow, with landmarks last ("زرنج، ناحیه ۵، پهلوی شفاخانه ABC، داخل کوچه موتررو"), and the map
 * knows the towns and districts far better than the landmarks: asked the whole line it usually knows nothing. So the
 * narrowest parts are dropped one at a time ("زرنج، ناحیه ۵، پهلوی شفاخانه ABC", then "زرنج، ناحیه ۵", then "زرنج"),
 * each with the province after it, and at the end the same without the province in case it was wrong. Parts are
 * split at the commas people write (،  ,  ؛), blanks and repeats are dropped, and the digits are left as written.
 */
export function addressQueries(
  text: string,
  provinceName?: string | null,
): string[] {
  const parts: string[] = [];
  for (const raw of text.split(/[،,؛;\n]+/)) {
    const part = raw.replace(/\s+/g, ' ').trim();
    if (part && !parts.includes(part)) parts.push(part);
  }
  if (parts.length === 0) return [];
  const province = provinceName?.trim() ?? '';
  const withProvince = (list: string[]) =>
    // A province already named in the text is not added again.
    province && !list.includes(province)
      ? [...list, province].join('، ')
      : list.join('، ');
  const queries: string[] = [];
  for (let count = parts.length; count >= 1; count--) {
    const query = withProvince(parts.slice(0, count));
    if (!queries.includes(query)) queries.push(query);
  }
  // Last resort: the first part alone, in case the province given was the wrong one.
  if (province && !queries.includes(parts[0])) queries.push(parts[0]);
  return queries.slice(0, MAX_ADDRESS_QUERIES);
}

/** What a loose address search found: as `findAddress`, and whether the whole address was understood. */
export type LooseAddressSearch =
  | { status: 'found'; coordinate: Coordinate; zoom: number; exact: boolean }
  | { status: 'none' }
  | { status: 'failed' };

/**
 * Finds a written address on the map even when the map does not know all of it: tries `addressQueries` in order,
 * a little more than a second apart, and takes the first that finds a place inside Afghanistan. `exact` says the
 * whole address was found, not just its town or district, so the caller can call the pin "approximate". `failed`
 * (no network) stops at once; `none` means every question was asked and none was known. Never throws.
 */
export async function findAddressLoosely(
  text: string,
  provinceName?: string | null,
  signal?: AbortSignal,
  market: Market = DEFAULT_MARKET,
): Promise<LooseAddressSearch> {
  const queries = addressQueries(text, provinceName);
  for (let index = 0; index < queries.length; index++) {
    if (index > 0) {
      await pause(GEOCODER_GAP_MS, signal);
    }
    if (signal?.aborted) return { status: 'failed' };
    const result = await findAddress(queries[index], signal, market);
    if (result.status === 'failed') return result;
    if (result.status === 'found') return { ...result, exact: index === 0 };
  }
  return { status: 'none' };
}
