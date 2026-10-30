import type { StyleSpecification } from 'mapbox-gl';

/**
 * Base map: Mapbox GL JS with the Mapbox Streets style. Vector tiles are drawn at the screen's own pixel density, so
 * they are sharp on retina screens, and they zoom smoothly (no pictures being stretched).
 *
 * Settings (read at build time, they reach the browser):
 *   NEXT_PUBLIC_MAPBOX_TOKEN   your Mapbox PUBLIC access token (starts with "pk."). Required: without it the map says so
 *                              instead of drawing. Restrict it to your site's address in the Mapbox account page, because
 *                              anyone can read it in the browser. Never put a secret token ("sk.") here.
 *   NEXT_PUBLIC_MAPBOX_STYLE   the style, default 'mapbox://styles/mapbox/streets-v12'. 'mapbox://styles/mapbox/light-v11' is
 *                              the paler one; your own Studio style ('mapbox://styles/<you>/<id>') works too, but the map is
 *                              always a light, daytime one: an address that names a dark / night style is ignored.
 *   NEXT_PUBLIC_MAP_TILE_MAX_ZOOM      how far in the person can zoom (default 20)
 *   NEXT_PUBLIC_MAP_FALLBACK_TILE_URL  the raster tiles to switch to when the style fails ({z}/{x}/{y} in the address)
 *
 * Mapbox charges by map load (a free allowance, then per 1,000), so the token's usage is worth watching.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
export const DEFAULT_MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';
const CUSTOM_FALLBACK = process.env.NEXT_PUBLIC_MAP_FALLBACK_TILE_URL?.trim();

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const TILE_MAX_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM) || 20;

/** A style address whose name says it is a dark one (Mapbox Dark, Navigation Night, a Studio style called "…-night"). */
const DARK_STYLE = /dark|night/i;

/**
 * The style to draw for a configured address: the address when it is a light one, otherwise Mapbox Streets. The map is
 * always a bright, daytime map, whatever the page, the visitor's colour scheme or the deployment's settings say.
 */
export const lightStyle = (configured?: string | null): string => {
  const wanted = configured?.trim();
  return wanted && !DARK_STYLE.test(wanted) ? wanted : DEFAULT_MAPBOX_STYLE;
};

/** The map's style address (always a light one, see `lightStyle`). */
export const mapStyle = (): string => lightStyle(process.env.NEXT_PUBLIC_MAPBOX_STYLE);

/** The colours street, neighbourhood and place names get: the map is always a light one, so the dark-on-white pair. */
export const detailTheme = (): 'light' => 'light';

/**
 * The style the map is switched to (as a whole, see OfficeMap) when Mapbox cannot be reached or refuses the token (a
 * wrong or URL-restricted one answers 401/403): OpenStreetMap's raster tiles, unless NEXT_PUBLIC_MAP_FALLBACK_TILE_URL
 * says otherwise. Plain raster tiles need no fonts, icons or token, so this is the style least likely to fail too.
 */
export function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [CUSTOM_FALLBACK || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#EEF1EE' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

// ───────────────────────────── local-language labels ─────────────────────────────

/** A label expression that says the place's own name (Persian / Pashto script where the map has it), then the English one. */
const LOCAL_FIRST = ['coalesce', ['get', 'name'], ['get', 'name_en']] as const;

/**
 * Mapbox Streets writes place names in English by default ("name_en", with the local name only as the fallback). For
 * this app the local name comes first: Dari and Pashto names are what people read and search by, as on Divar. Only name
 * lookups change: the rest of a label expression (formats, numbers, shields) is left alone. Pure, so it can be tested.
 */
export function localizeLabel(value: unknown): unknown {
  if (typeof value === 'string') {
    // The older "{name_en}" token form.
    return value.trim() === '{name_en}' ? [...LOCAL_FIRST] : value;
  }
  if (!Array.isArray(value)) return value;
  if (value[0] === 'get' && value[1] === 'name_en' && value.length === 2) return [...LOCAL_FIRST];
  return value.map((part) => localizeLabel(part));
}

/** The minimum of the map this needs, so it can be tested without a browser. */
export interface LabelMap {
  getStyle(): { layers?: Array<{ id: string; type: string; layout?: Record<string, unknown> }> } | undefined;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
}

/** Puts the local name first on every label of the style the map has loaded. Returns how many layers changed. */
export function localizeLabels(map: LabelMap): number {
  const layers = map.getStyle()?.layers ?? [];
  let changed = 0;
  for (const layer of layers) {
    const field = layer.type === 'symbol' ? layer.layout?.['text-field'] : undefined;
    if (field === undefined) continue;
    const next = localizeLabel(field);
    if (JSON.stringify(next) === JSON.stringify(field)) continue;
    try {
      map.setLayoutProperty(layer.id, 'text-field', next);
      changed += 1;
    } catch {
      // A layer that refuses stays as it was: its label is simply in the style's own language.
    }
  }
  return changed;
}

/** Kabul, a street-level-ish start when the office has no listing on the map yet. */
export const DEFAULT_CENTER: [number, number] = [69.1761, 34.5281];
/** The same for Iran (Tehran). */
export const IRAN_CENTER: [number, number] = [51.389, 35.6892];

/** The capital a market's map starts on. */
export const defaultCenter = (market: 'AF' | 'IR'): [number, number] => (market === 'IR' ? IRAN_CENTER : DEFAULT_CENTER);
