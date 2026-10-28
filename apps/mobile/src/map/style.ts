import {
  MAP_FALLBACK_TILE_MAX_ZOOM,
  MAP_FALLBACK_TILE_URL,
  MAP_STYLE_URL,
  SATELLITE_STYLE_URL,
} from '../config';

/**
 * A map style written out in full (the Mapbox style specification, the part the app touches). The raster fallback
 * below is built by the app; the street and satellite styles are Mapbox's own, downloaded and adjusted (streetStyle.ts).
 */
export interface StyleSpecification {
  version: number;
  sources: Record<string, unknown>;
  layers: Array<{
    id: string;
    type: string;
    source?: string;
    minzoom?: number;
    layout?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** What the map accepts as a style: the address of a style, or the style itself. */
export type MapStyle = string | StyleSpecification;

/**
 * The street map is Mapbox Streets, fetched by address (see config.ts): the Mapbox SDK downloads the style, its
 * fonts, sprites and vector tiles from Mapbox, with the app's access token. `styleFor` swaps in the same style with
 * local-language labels once streetStyle.ts has made it.
 */
export const BASE_MAP_STYLE: MapStyle = MAP_STYLE_URL;

/**
 * The map made of one raster tile server. Only the fallback street map uses it (when the vector style cannot be
 * loaded), so it is the plain OpenStreetMap tiles by default.
 */
export function rasterStyle(
  tileUrl: string = MAP_FALLBACK_TILE_URL,
  maxZoom: number = MAP_FALLBACK_TILE_MAX_ZOOM,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: maxZoom,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

/** Built once: the map reloads the style whenever it receives a new object. */
export const FALLBACK_MAP_STYLE = rasterStyle();

// ───────────────────────────── satellite ─────────────────────────────

/**
 * The satellite map is Mapbox Satellite Streets (`satellite-streets-v12`), read by address like the street map: the
 * aerial photographs with the vector street layer on top (roads and their outlines, building outlines, names). It
 * replaces the raster-only imagery the app drew before, which had no roads of its own and went soft past zoom 16.
 * `styleFor` swaps in the same style with local-language labels once streetStyle.ts has made it.
 */
export const SATELLITE_MAP_STYLE: MapStyle = SATELLITE_STYLE_URL;

/** The base maps a person can switch between. */
export type MapStyleKind = 'street' | 'satellite';

/**
 * The style for a kind (always the same value for the same arguments, so the map does not reload it on every
 * render). `failed`: that style could not be loaded (or there is no Mapbox token), so the plain raster street map
 * stands in for it. `localized`: the same Mapbox style with local-language labels, when streetStyle.ts has it; until
 * then (or when it could not be made) the map reads Mapbox's own style by address, labels in its default language.
 */
export const styleFor = (
  kind: MapStyleKind,
  failed = false,
  localized: StyleSpecification | null = null,
): MapStyle =>
  failed
    ? FALLBACK_MAP_STYLE
    : localized ?? (kind === 'satellite' ? SATELLITE_MAP_STYLE : BASE_MAP_STYLE);
