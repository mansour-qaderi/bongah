import { useEffect, useState } from 'react';
import {
  MAP_STYLE_API_URL,
  MAPBOX_ACCESS_TOKEN,
  REQUEST_TIMEOUT_MS,
  SATELLITE_STYLE_API_URL,
} from '../config';
import { within } from '../utils/within';
import { enhanceStyle } from './detail';
import type { StyleSpecification } from './style';

/**
 * A label that says the place's own name first (Dari / Pashto script where the map has it), then the English one.
 * Mapbox Streets writes names in English by default ("name_en", the local name only as the fallback); Persian is not
 * among the languages its tiles translate into, and the SDK's own label-language setting does not offer it either, so
 * for this app the local name has to come first, as on Divar. Same rule as the website (apps/web/lib/map-config.ts).
 */
const LOCAL_FIRST = ['coalesce', ['get', 'name'], ['get', 'name_en']] as const;

/**
 * Points the name lookups of one label (a style's `text-field`) at the local name. Only `["get", "name_en"]` (and the
 * older `"{name_en}"` text) change: the rest of a label expression (formats, numbers, shields) is left alone. Pure.
 */
export function localizeLabel(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim() === '{name_en}' ? [...LOCAL_FIRST] : value;
  }
  if (!Array.isArray(value)) return value;
  if (value.length === 2 && value[0] === 'get' && value[1] === 'name_en') {
    return [...LOCAL_FIRST];
  }
  return value.map(part => localizeLabel(part));
}

/**
 * A copy of the style whose symbol layers show local names first. The input is never changed. `changed` is how many
 * layers were rewritten (0 means the style was not one this knows how to adjust).
 */
export function localizeStyle(style: StyleSpecification): {
  style: StyleSpecification;
  changed: number;
} {
  let changed = 0;
  const layers = style.layers.map(layer => {
    const field = layer.type === 'symbol' ? layer.layout?.['text-field'] : undefined;
    if (field === undefined) return layer;
    const next = localizeLabel(field);
    if (JSON.stringify(next) === JSON.stringify(field)) return layer;
    changed += 1;
    return { ...layer, layout: { ...layer.layout, 'text-field': next } };
  });
  return { style: { ...style, layers }, changed };
}

/** Anything shaped like a style: what has to be true before it is handed to the map. */
function isStyle(value: unknown): value is StyleSpecification {
  const style = value as Partial<StyleSpecification> | null;
  return (
    typeof style === 'object' &&
    style !== null &&
    style.version === 8 &&
    Array.isArray(style.layers) &&
    typeof style.sources === 'object' &&
    style.sources !== null
  );
}

/**
 * Downloads a Mapbox style by its HTTPS address and runs `adjust` over it. Resolves with null when that is not possible
 * (no token, offline, refused, not a style), and the map then reads the style by address instead, in Mapbox's default
 * language: a worse label, never a missing map. `mapbox://` addresses inside the style (sprites, fonts, tiles) are
 * resolved by the SDK itself, with the same token.
 */
async function fetchStyle(
  url: string,
  adjust: (style: StyleSpecification) => StyleSpecification,
  fetcher: typeof fetch,
  token: string,
): Promise<StyleSpecification | null> {
  if (!token) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(
        `${url}?access_token=${encodeURIComponent(token)}`,
        { signal: controller.signal },
      );
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!isStyle(body)) return null;
      return adjust(body);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * The Mapbox Streets style with local names first and the city in more detail (building footprints and street and
 * neighbourhood names from earlier zooms, see detail.ts). The blocks only show once the map is tilted, which the person
 * does with the 3D button (BaseMap `tilted`): seen from straight above they are just roofs.
 */
export function fetchStreetStyle(
  fetcher: typeof fetch = fetch,
  token: string = MAPBOX_ACCESS_TOKEN,
): Promise<StyleSpecification | null> {
  return fetchStyle(
    MAP_STYLE_API_URL,
    style => enhanceStyle(localizeStyle(style).style).style,
    fetcher,
    token,
  );
}

/**
 * The Mapbox Satellite Streets style with local names first. Only the labels change: the photographs, the roads drawn
 * over them and the building outlines are Mapbox's own, which is what keeps them readable at high zoom (the footprint
 * and 3D additions of the street map would only add clutter on top of a photograph).
 */
export function fetchSatelliteStyle(
  fetcher: typeof fetch = fetch,
  token: string = MAPBOX_ACCESS_TOKEN,
): Promise<StyleSpecification | null> {
  return fetchStyle(
    SATELLITE_STYLE_API_URL,
    style => localizeStyle(style).style,
    fetcher,
    token,
  );
}

/**
 * One download per run of the app and per style, shared by every map on screen. A failure is not remembered: the next
 * map tries again.
 */
function sharedLoader(fetchIt: () => Promise<StyleSpecification | null>) {
  let loaded: StyleSpecification | null = null;
  let pending: Promise<StyleSpecification | null> | null = null;
  return {
    peek: () => loaded,
    load(): Promise<StyleSpecification | null> {
      if (loaded) return Promise.resolve(loaded);
      if (!pending) {
        pending = fetchIt().then(style => {
          loaded = style;
          pending = null;
          return style;
        });
      }
      return pending;
    },
    reset() {
      loaded = null;
      pending = null;
    },
  };
}

const street = sharedLoader(() => fetchStreetStyle());
const satellite = sharedLoader(() => fetchSatelliteStyle());

/** The localized street style, downloading it the first time it is asked for. */
export const loadStreetStyle = street.load;
/** The localized satellite style, downloading it the first time it is asked for. */
export const loadSatelliteStyle = satellite.load;

/** Forgets what was downloaded. For tests. */
export function resetStreetStyleForTests() {
  street.reset();
  satellite.reset();
}

/** Waiting for the download; ready (with the style); or not going to happen (no token, offline, refused). */
export type StreetStyleState =
  | { status: 'loading' }
  | { status: 'ready'; style: StyleSpecification }
  | { status: 'unavailable' };

/** How long a map waits for the label-adjusted style before it simply uses Mapbox's own. */
const WAIT_MS = 4_000;

function useLoadedStyle(
  loader: ReturnType<typeof sharedLoader>,
  enabled: boolean,
): StreetStyleState {
  const [state, setState] = useState<StreetStyleState>(() => {
    const ready = loader.peek();
    if (ready) return { status: 'ready', style: ready };
    return { status: MAPBOX_ACCESS_TOKEN ? 'loading' : 'unavailable' };
  });

  useEffect(() => {
    if (!enabled || !MAPBOX_ACCESS_TOKEN) return undefined;
    let live = true;
    // `within` gives up waiting after WAIT_MS; the download itself carries on and is kept for the next map.
    within(loader.load(), WAIT_MS, null).then(style => {
      if (live) {
        setState(style ? { status: 'ready', style } : { status: 'unavailable' });
      }
    });
    return () => {
      live = false;
    };
  }, [enabled, loader]);

  return state;
}

/**
 * The localized street style for a map. `enabled` false (the satellite view, say) downloads nothing. A map waits for
 * it only briefly: showing a map in the default label language beats showing none while a slow network answers.
 */
export function useStreetStyle(enabled: boolean): StreetStyleState {
  return useLoadedStyle(street, enabled);
}

/** The same for the satellite view: Mapbox Satellite Streets with the labels in the local language. */
export function useSatelliteStyle(enabled: boolean): StreetStyleState {
  return useLoadedStyle(satellite, enabled);
}
