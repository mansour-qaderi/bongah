import {
  GEOCODER_TIMEOUT_MS,
  GEOCODER_URL,
  GEOCODER_USER_AGENT,
} from '../config';
import {
  matchProvince,
  PROVINCES,
  type Province,
} from '../constants/provinces';
import type { Coordinate } from './geo';

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
