import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { MAP_TILE_MAX_ZOOM, MAP_TILE_URL } from '../config';

/**
 * The whole base map is one raster layer of tiles. There is no vector style, so no glyphs or
 * sprites are needed (the app draws its own pins as circles) and nothing is fetched from anyone
 * except the tile server in config.ts.
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
