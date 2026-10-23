import type { StyleSpecification } from 'maplibre-gl';

/**
 * Map tiles. OpenStreetMap's own server is for light use (see its tile usage policy); set NEXT_PUBLIC_MAP_TILE_URL to a
 * tile service you pay for or host before a public release. These are read at build time (they reach the browser).
 */
export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_MAX_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM) || 19;

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
