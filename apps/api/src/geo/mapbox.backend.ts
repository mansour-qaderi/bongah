import type { PlaceDetails, PlaceSuggestion, RouteResult } from '@bongah/shared-types';
import {
  fetchJson,
  GeoBackendError,
  isFiniteNumber,
  pickRoute,
  textOf,
  type AutocompleteRequest,
  type GeoBackend,
  type LatLng,
} from './geo.backend.js';

const BASE = 'https://api.mapbox.com';
/** What the search may suggest: shops, cafés, hospitals and schools first, then streets, areas and towns. */
const SUGGEST_TYPES = 'poi,address,street,neighborhood,locality,place,district,region';

interface MapboxContext {
  region?: { name?: string };
  district?: { name?: string };
  place?: { name?: string };
  locality?: { name?: string };
  neighborhood?: { name?: string };
  street?: { name?: string };
}
interface MapboxFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    context?: MapboxContext;
  };
}

function contextParts(context: MapboxContext | undefined) {
  const name = (part?: { name?: string }) => textOf(part?.name) || null;
  return {
    province: name(context?.region),
    district: name(context?.district) ?? name(context?.place),
    neighborhood: name(context?.neighborhood) ?? name(context?.locality),
    street: name(context?.street),
  };
}

function detailsFrom(feature: MapboxFeature | undefined): PlaceDetails | null {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as unknown[];
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const properties = feature?.properties;
  const address = textOf(properties?.full_address) || textOf(properties?.place_formatted);
  return {
    provider: 'mapbox',
    title: textOf(properties?.name) || address,
    address,
    lat,
    lng,
    ...contextParts(properties?.context),
  };
}

/**
 * Mapbox: Search Box API for the search and the chosen place (it knows points of interest, which the plain geocoder
 * does not), Geocoding v6 for "what is at this spot", Directions for a driving route. Server-side only.
 */
export class MapboxGeoBackend implements GeoBackend {
  readonly name = 'mapbox' as const;

  constructor(
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async autocomplete(request: AutocompleteRequest): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({
      q: request.query,
      access_token: this.token,
      language: request.language,
      country: 'af',
      limit: '8',
      types: SUGGEST_TYPES,
    });
    // Search Box requires a session token; one made up per request still works (it is billed per request then).
    params.set('session_token', request.session ?? crypto.randomUUID());
    if (request.near) params.set('proximity', `${request.near.lng},${request.near.lat}`);
    const body = (await fetchJson('mapbox', `${BASE}/search/searchbox/v1/suggest?${params}`, {
      timeoutMs: this.timeoutMs,
    })) as {
      suggestions?: {
        mapbox_id?: string;
        name?: string;
        full_address?: string;
        place_formatted?: string;
        poi_category_ids?: string[];
        feature_type?: string;
      }[];
    };
    const out: PlaceSuggestion[] = [];
    for (const suggestion of body.suggestions ?? []) {
      const id = textOf(suggestion.mapbox_id);
      const title = textOf(suggestion.name);
      if (!id || !title) continue;
      out.push({
        id,
        provider: 'mapbox',
        title,
        subtitle: textOf(suggestion.place_formatted) || textOf(suggestion.full_address),
        category: suggestion.poi_category_ids?.[0] || textOf(suggestion.feature_type) || null,
        lat: null,
        lng: null,
      });
    }
    return out;
  }

  async place(id: string, session: string | undefined, language: string): Promise<PlaceDetails | null> {
    const params = new URLSearchParams({
      access_token: this.token,
      session_token: session ?? crypto.randomUUID(),
      language,
    });
    let body: { features?: MapboxFeature[] };
    try {
      body = (await fetchJson('mapbox', `${BASE}/search/searchbox/v1/retrieve/${encodeURIComponent(id)}?${params}`, {
        timeoutMs: this.timeoutMs,
      })) as typeof body;
    } catch (error) {
      if (error instanceof GeoBackendError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    }
    return detailsFrom(body.features?.[0]);
  }

  async reverse(point: LatLng, language: string): Promise<PlaceDetails | null> {
    const params = new URLSearchParams({
      longitude: String(point.lng),
      latitude: String(point.lat),
      access_token: this.token,
      language,
      limit: '1',
    });
    const body = (await fetchJson('mapbox', `${BASE}/search/geocode/v6/reverse?${params}`, {
      timeoutMs: this.timeoutMs,
    })) as { features?: MapboxFeature[] };
    const found = detailsFrom(body.features?.[0]);
    // What is at the spot is described; the spot itself stays the one asked about.
    return found ? { ...found, lat: point.lat, lng: point.lng } : null;
  }

  async route(from: LatLng, to: LatLng): Promise<RouteResult | null> {
    // `driving` (road speeds, no live traffic: there is little of it here) with the alternatives too: the quickest of
    // them is chosen below (see pickRoute), not just Mapbox's first.
    const params = new URLSearchParams({
      access_token: this.token,
      geometries: 'geojson',
      overview: 'full',
      alternatives: 'true',
      steps: 'false',
    });
    const body = (await fetchJson(
      'mapbox',
      `${BASE}/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?${params}`,
      { timeoutMs: this.timeoutMs },
    )) as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[] };
    if (body.code && body.code !== 'Ok') return null; // NoRoute, NoSegment: nothing drivable between the two
    const readable: RouteResult[] = [];
    for (const route of body.routes ?? []) {
      const raw = route?.geometry?.coordinates;
      if (!Array.isArray(raw) || !isFiniteNumber(route.distance) || !isFiniteNumber(route.duration)) continue;
      const coordinates = raw.filter(
        (pair): pair is [number, number] => Array.isArray(pair) && isFiniteNumber(pair[0]) && isFiniteNumber(pair[1]),
      );
      if (coordinates.length < 2) continue;
      readable.push({ provider: 'mapbox', distance_m: route.distance, duration_s: route.duration, coordinates });
    }
    return pickRoute(readable);
  }
}
