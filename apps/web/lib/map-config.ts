import type { RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Map tiles. OpenStreetMap's own server is for light use (see its tile usage policy); set NEXT_PUBLIC_MAP_TILE_URL to a
 * tile service you pay for or host before a public release. These are read at build time (they reach the browser).
 */
export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_MAX_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM) || 19;

/**
 * Used when the main tile server refuses or fails (OpenStreetMap blocks clients it does not like, and a browser cannot
 * set a User-Agent to identify itself, so a second provider is the reliable answer). CARTO's free basemaps are for
 * non-commercial use: set NEXT_PUBLIC_MAP_FALLBACK_TILE_URL to a service you pay for or host before a commercial launch.
 */
const CUSTOM_FALLBACK = process.env.NEXT_PUBLIC_MAP_FALLBACK_TILE_URL;
export const FALLBACK_TILES: string[] = CUSTOM_FALLBACK
  ? [CUSTOM_FALLBACK]
  : ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`);
export const FALLBACK_ATTRIBUTION = CUSTOM_FALLBACK ? '© OpenStreetMap' : '© OpenStreetMap © CARTO';

/** The base-map source made from the fallback tiles. Swapped in as a whole (see OfficeMap): changing a failed source's tile list in place breaks its renderer. */
export function fallbackSource(): RasterSourceSpecification {
  return { type: 'raster', tiles: FALLBACK_TILES, tileSize: 256, maxzoom: TILE_MAX_ZOOM, attribution: FALLBACK_ATTRIBUTION };
}

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [TILE_URL],
        tileSize: 256,
        maxzoom: TILE_MAX_ZOOM,
        attribution: '© OpenStreetMap',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#EEF1EE' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

/** Kabul, a street-level-ish start when the office has no listing on the map yet. */
export const DEFAULT_CENTER: [number, number] = [69.1761, 34.5281];
