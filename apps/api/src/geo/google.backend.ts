import type { PlaceDetails, PlaceSuggestion, RouteResult } from '@bongah/shared-types';
import {
  decodePolyline,
  fetchJson,
  GeoBackendError,
  isFiniteNumber,
  pickRoute,
  textOf,
  type AutocompleteRequest,
  type GeoBackend,
  type LatLng,
} from './geo.backend.js';

/** How far around the person's position the search leans (it still finds places further away, ranked lower). */
const BIAS_RADIUS_M = 50_000;
const PLACE_FIELDS = 'id,displayName,formattedAddress,location,addressComponents,types,primaryType';

interface GoogleText {
  text?: string;
}
interface GooglePrediction {
  placeId?: string;
  text?: GoogleText;
  structuredFormat?: { mainText?: GoogleText; secondaryText?: GoogleText };
  types?: string[];
}
interface GoogleComponent {
  longText?: string;
  long_name?: string;
  types?: string[];
}

/** The first component of one of these types, in the order given. Places API (New) and Geocoding name it differently. */
function component(components: GoogleComponent[] | undefined, types: readonly string[]): string | null {
  for (const type of types) {
    const hit = components?.find((c) => c.types?.includes(type));
    const value = textOf(hit?.longText ?? hit?.long_name);
    if (value) return value;
  }
  return null;
}

function addressParts(components: GoogleComponent[] | undefined) {
  return {
    province: component(components, ['administrative_area_level_1']),
    district: component(components, ['administrative_area_level_2', 'locality', 'sublocality_level_1']),
    neighborhood: component(components, ['neighborhood', 'sublocality', 'sublocality_level_1', 'sublocality_level_2']),
    street: component(components, ['route']),
  };
}

/** The most telling type of a place for the dropdown's icon ("hospital", "university", "cafe"), or null. */
function categoryOf(types: string[] | undefined, primary?: string): string | null {
  const generic = new Set(['point_of_interest', 'establishment', 'geocode', 'political']);
  return primary || types?.find((type) => !generic.has(type)) || null;
}

/**
 * Google Maps Platform: Places API (New) for the search and the chosen place, the Geocoding API for "what is at this
 * spot", the Routes API for a driving route. Only ever called from the server (see geo.config.ts).
 */
export class GoogleGeoBackend implements GeoBackend {
  readonly name = 'google' as const;

  constructor(
    private readonly key: string,
    private readonly timeoutMs: number,
  ) {}

  async autocomplete(request: AutocompleteRequest): Promise<PlaceSuggestion[]> {
    const body = (await fetchJson('google', 'https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': this.key },
      body: {
        input: request.query,
        languageCode: request.language,
        includedRegionCodes: ['af'],
        ...(request.session ? { sessionToken: request.session } : {}),
        ...(request.near
          ? {
              locationBias: {
                circle: { center: { latitude: request.near.lat, longitude: request.near.lng }, radius: BIAS_RADIUS_M },
              },
            }
          : {}),
      },
      timeoutMs: this.timeoutMs,
    })) as { suggestions?: { placePrediction?: GooglePrediction }[] };

    const out: PlaceSuggestion[] = [];
    for (const suggestion of body.suggestions ?? []) {
      const prediction = suggestion.placePrediction;
      const id = textOf(prediction?.placeId);
      const title = textOf(prediction?.structuredFormat?.mainText?.text) || textOf(prediction?.text?.text);
      if (!id || !title) continue;
      out.push({
        id,
        provider: 'google',
        title,
        subtitle: textOf(prediction?.structuredFormat?.secondaryText?.text),
        category: categoryOf(prediction?.types),
        lat: null,
        lng: null,
      });
    }
    return out;
  }

  async place(id: string, session: string | undefined, language: string): Promise<PlaceDetails | null> {
    const params = new URLSearchParams({ languageCode: language, regionCode: 'af' });
    if (session) params.set('sessionToken', session);
    let body: {
      displayName?: GoogleText;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: GoogleComponent[];
    };
    try {
      body = (await fetchJson('google', `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?${params}`, {
        headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': PLACE_FIELDS },
        timeoutMs: this.timeoutMs,
      })) as typeof body;
    } catch (error) {
      // An id Google does not know (or no longer knows) is "nothing there", not an outage.
      if (error instanceof GeoBackendError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    }
    const lat = body.location?.latitude;
    const lng = body.location?.longitude;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
    const address = textOf(body.formattedAddress);
    return {
      provider: 'google',
      title: textOf(body.displayName?.text) || address,
      address,
      lat,
      lng,
      ...addressParts(body.addressComponents),
    };
  }

  async reverse(point: LatLng, language: string): Promise<PlaceDetails | null> {
    const params = new URLSearchParams({
      latlng: `${point.lat},${point.lng}`,
      language,
      key: this.key,
    });
    const body = (await fetchJson('google', `https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      timeoutMs: this.timeoutMs,
    })) as {
      status?: string;
      results?: { formatted_address?: string; address_components?: GoogleComponent[] }[];
    };
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK') throw new GeoBackendError('google', `geocoding status ${body.status ?? 'missing'}`);
    // The first answer is the most precise one (a street address before the district before the province).
    const first = body.results?.[0];
    if (!first) return null;
    const parts = addressParts(first.address_components);
    const address = textOf(first.formatted_address);
    return {
      provider: 'google',
      title: parts.street ?? parts.neighborhood ?? parts.district ?? address,
      address,
      lat: point.lat,
      lng: point.lng,
      ...parts,
    };
  }

  async route(from: LatLng, to: LatLng): Promise<RouteResult | null> {
    const body = (await fetchJson('google', 'https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': this.key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: {
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        polylineQuality: 'HIGH_QUALITY',
        // Ask for the other ways too: the quickest of them is chosen below (see pickRoute), not just Google's first.
        computeAlternativeRoutes: true,
        regionCode: 'AF',
        units: 'METRIC',
      },
      timeoutMs: this.timeoutMs,
    })) as { routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[] };
    const readable: RouteResult[] = [];
    for (const route of body.routes ?? []) {
      const encoded = textOf(route?.polyline?.encodedPolyline);
      if (!encoded) continue;
      const coordinates = decodePolyline(encoded);
      // Durations come as "1234s".
      const seconds = Number.parseFloat(textOf(route.duration).replace(/s$/, ''));
      if (coordinates.length < 2 || !isFiniteNumber(route.distanceMeters) || !Number.isFinite(seconds)) continue;
      readable.push({ provider: 'google', distance_m: route.distanceMeters, duration_s: seconds, coordinates });
    }
    return pickRoute(readable);
  }
}
