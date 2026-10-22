import type { ConfigService } from '@nestjs/config';
import type { GeoProvider } from '@bongah/shared-types';

/**
 * Which paid place/route services the API may ask, in the order it asks them. The keys live only here, on the server:
 * the app never sees them (and the app's "no Google in the app" test stays true), and they can be rotated without a
 * new release.
 *
 *  - GOOGLE_MAPS_API_KEY  Places API (New) for the search and the chosen place, Geocoding API for "what is here",
 *                         Routes API for driving routes. Google knows far more of Afghanistan's shops, cafés,
 *                         hospitals and schools than OpenStreetMap does, which is why it is asked first.
 *  - MAPBOX_ACCESS_TOKEN  Search Box API, Geocoding v6 and Directions: the second choice, or the only one.
 *  - GEO_PROVIDERS        Optional order, comma-separated ("mapbox,google"). Left out: every configured one, Google first.
 *
 * With neither key the /geo endpoints answer 503 and the app asks OpenStreetMap (Nominatim, OSRM) itself, as before.
 */
export interface GeoSettings {
  providers: GeoProvider[];
  googleKey: string | null;
  mapboxToken: string | null;
  timeoutMs: number;
}

export function readGeoSettings(config: Pick<ConfigService, 'get'>): GeoSettings {
  const text = (name: string): string => (config.get<string>(name) ?? '').trim();
  const googleKey = text('GOOGLE_MAPS_API_KEY') || null;
  const mapboxToken = text('MAPBOX_ACCESS_TOKEN') || null;
  const configured: Record<GeoProvider, boolean> = { google: googleKey !== null, mapbox: mapboxToken !== null };

  const rawOrder = text('GEO_PROVIDERS').toLowerCase();
  let providers: GeoProvider[];
  if (rawOrder) {
    providers = [];
    for (const name of rawOrder.split(',').map((part) => part.trim()).filter(Boolean)) {
      if (name !== 'google' && name !== 'mapbox') {
        throw new Error(`GEO_PROVIDERS lists "${name}". Use "google" and/or "mapbox", comma-separated.`);
      }
      if (!configured[name]) {
        throw new Error(
          `GEO_PROVIDERS lists "${name}" but ${name === 'google' ? 'GOOGLE_MAPS_API_KEY' : 'MAPBOX_ACCESS_TOKEN'} is not set.`,
        );
      }
      if (!providers.includes(name)) providers.push(name);
    }
  } else {
    providers = (['google', 'mapbox'] as const).filter((name) => configured[name]);
  }

  const rawTimeout = text('GEO_TIMEOUT_MS');
  const timeoutMs = rawTimeout ? Number(rawTimeout) : 6000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30_000) {
    throw new Error('GEO_TIMEOUT_MS must be a whole number of milliseconds between 1000 and 30000.');
  }
  return { providers, googleKey, mapboxToken, timeoutMs };
}
