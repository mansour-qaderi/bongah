import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { MAP_TILE_MAX_ZOOM, MAP_TILE_URL } from '../config';

/**
 * The whole base map is raster tiles. There is no vector style, so no glyphs or sprites are needed (the app draws its
 * own pins as circles) and nothing is fetched from anyone except the tile servers named here and in config.ts.
 */
export function rasterStyle(
  tileUrl: string = MAP_TILE_URL,
  maxZoom: number = MAP_TILE_MAX_ZOOM,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: maxZoom,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

/** Built once: MapLibre reloads the style whenever it receives a new object. */
export const BASE_MAP_STYLE = rasterStyle();

// ───────────────────────────── satellite ─────────────────────────────

/**
 * Aerial photographs (Esri World Imagery): the whole country at about a metre a pixel and cities and towns sharper, so
 * plots, roofs and lanes can be told apart. Needs no key. Like the OpenStreetMap tiles it is a shared service meant for
 * light use: before a public launch with real traffic, swap the URL for a plan of your own (MapTiler's
 * `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=YOUR_KEY` is what the agvmap site uses) and keep
 * SATELLITE_ATTRIBUTION accurate for it. Nothing else in the app has to change.
 */
export const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
/**
 * Place and road names drawn over the photographs (Esri's transparent reference layer), so the satellite view still
 * says where things are, as agvmap's "hybrid" does.
 */
export const SATELLITE_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
/**
 * The deepest imagery level the app ever asks for; past it the map keeps zooming by enlarging this level.
 *
 * Why it is not 19: Esri has photographs at every zoom only for some cities. Where it has none at the asked level its
 * server does not answer "no such tile" (which MapLibre would answer by enlarging the level above): it answers 200 with
 * a grey picture reading "Map data not yet available", which is drawn as if it were the map. Asking for no level deeper
 * than 16 keeps every request inside what Esri serves across the country's towns; the cost is that a few cities with
 * sharper photographs (Kabul, Herat) look a little soft at street zoom. A paid imagery plan that answers every level
 * (see the note above) can raise this again; the limit lives here and nowhere else.
 */
export const SATELLITE_TILE_MAX_ZOOM = 16;
/** The credit the imagery's licence asks for; it is in the Account tab with the map credit. */
export const SATELLITE_ATTRIBUTION =
  'Esri, Maxar, Earthstar Geographics, and the GIS User Community';
export const SATELLITE_ATTRIBUTION_URL = 'https://www.esri.com/en-us/legal/terms/data-attributions';

export function satelliteStyle(
  imageryUrl: string = SATELLITE_TILE_URL,
  labelsUrl: string = SATELLITE_LABELS_URL,
  maxZoom: number = SATELLITE_TILE_MAX_ZOOM,
): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [imageryUrl],
        tileSize: 256,
        maxzoom: maxZoom,
      },
      labels: {
        type: 'raster',
        tiles: [labelsUrl],
        tileSize: 256,
        maxzoom: maxZoom,
      },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'imagery' },
      { id: 'labels', type: 'raster', source: 'labels' },
    ],
  };
}

export const SATELLITE_MAP_STYLE = satelliteStyle();

/** The base maps a person can switch between. */
export type MapStyleKind = 'street' | 'satellite';

/** The style object for a kind (always the same object, so MapLibre does not reload it on every render). */
export const styleFor = (kind: MapStyleKind): StyleSpecification =>
  kind === 'satellite' ? SATELLITE_MAP_STYLE : BASE_MAP_STYLE;
