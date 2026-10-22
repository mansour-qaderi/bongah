import type { GeoProvider, PlaceDetails, PlaceSuggestion, RouteResult } from '@bongah/shared-types';

/** One point, latitude first, as people say it. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** What the app asks the place search with. */
export interface AutocompleteRequest {
  query: string;
  near?: LatLng;
  session?: string;
  /** BCP-47 code for the answer's language: "fa" for Dari, "ps" for Pashto. */
  language: string;
}

/**
 * One paid place/route service. Every method either answers or throws a `GeoBackendError`; "found nothing" is an
 * answer (an empty list, or null), not an error, so the service does not ask the next provider about a place that
 * simply does not exist.
 */
export interface GeoBackend {
  readonly name: GeoProvider;
  autocomplete(request: AutocompleteRequest): Promise<PlaceSuggestion[]>;
  place(id: string, session: string | undefined, language: string): Promise<PlaceDetails | null>;
  reverse(point: LatLng, language: string): Promise<PlaceDetails | null>;
  route(from: LatLng, to: LatLng): Promise<RouteResult | null>;
}

/** Two routes whose times are within this share of each other are "as fast": the more direct of them is taken. */
export const NEAR_TIE = 0.1;

/**
 * The route to drive: the fastest of the ones the provider offered and, among those within 10 % of the fastest, the
 * shortest. A provider's first answer is its own idea of "best" (it may weigh tolls, highways or comfort); asking for
 * alternatives and choosing here is what makes the answer the quickest way there that does not go the long way round.
 */
export function pickRoute<T extends { distance_m: number; duration_s: number }>(routes: readonly T[]): T | null {
  if (routes.length === 0) return null;
  const fastest = Math.min(...routes.map((route) => route.duration_s));
  const close = routes.filter((route) => route.duration_s <= fastest * (1 + NEAR_TIE));
  return close.reduce((best, route) => (route.distance_m < best.distance_m ? route : best));
}

/** The provider could not be asked or did not answer properly (network, timeout, quota, a bad key). */
export class GeoBackendError extends Error {
  constructor(
    readonly provider: GeoProvider,
    message: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'GeoBackendError';
  }
}

/**
 * GET or POST JSON with a time limit; throws GeoBackendError on anything but a 2xx JSON answer. The URL is never
 * put in the error: it may carry the key.
 */
export async function fetchJson(
  provider: GeoProvider,
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown; timeoutMs: number },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new GeoBackendError(provider, timedOut ? `no answer within ${init.timeoutMs} ms` : 'could not be reached');
  }
  if (!response.ok) {
    throw new GeoBackendError(provider, `answered HTTP ${response.status}`, response.status);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GeoBackendError(provider, 'answered something that is not JSON');
  }
}

/** Decodes a Google encoded polyline (precision 5) into [longitude, latitude] pairs. */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push([lng / factor, lat / factor]);
  }
  return points;
}

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
