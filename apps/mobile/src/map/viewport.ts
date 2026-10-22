import type { Bounds } from './cluster';
import type { LngLat } from './geo';

/**
 * "What part of the map is on screen" turned into a request for the API.
 *
 * Asking for the exact screen would mean a new request on every tiny pan, and a blank map while it loads. So the
 * area asked for is the screen plus a margin, snapped outward to a grid. Small pans and zooms then land on the
 * same area (the same cached answer, no request at all) and only a real move asks for a new one.
 */

/** The box the API filters by: listings whose pin is inside it. Degrees. */
export interface Area {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

/** Extra to fetch beyond each edge of the screen, as a share of the screen's size, so the next pan is already there. */
export const AREA_MARGIN = 0.3;
/**
 * Keep using the area already loaded while it is no more than this many times the size of what is on screen.
 * When the loaded area is known to hold every listing in it, zooming in loses nothing, so it may be much bigger.
 */
export const MAX_OVERFETCH = 12;
export const MAX_OVERFETCH_COMPLETE = 64;

/** MapLibre's world is 512 dp wide at zoom 0 (the 256 px tiles are drawn at twice their size). */
const WORLD_DP = 512;
/** The API accepts at most 6-8 decimals; whole-degree fractions of two are cut to this. */
const DECIMALS = 6;
const MAX_LAT = 85;

const round = (value: number) => Number(value.toFixed(DECIMALS));
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The area a map shows, worked out from where its camera points, before the map has reported what it sees.
 * (Web Mercator, the projection the tiles use.) Only a first guess: the map's own report replaces it.
 */
export function boundsFromCamera(
  center: LngLat,
  zoom: number,
  width: number,
  height: number,
): Bounds {
  const [lng, lat] = center;
  const scale = WORLD_DP * 2 ** zoom;
  const sin = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180);
  const cx = ((lng + 180) / 360) * scale;
  const cy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  const toLng = (x: number) => (x / scale) * 360 - 180;
  const toLat = (y: number) => {
    const n = Math.PI - (2 * Math.PI * y) / scale;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
  };
  return [
    toLng(cx - width / 2),
    toLat(cy + height / 2),
    toLng(cx + width / 2),
    toLat(cy - height / 2),
  ];
}

/** The area to ask for, given what is on screen: the screen plus a margin, snapped outward to a grid. */
export function areaFor(bounds: Bounds, margin: number = AREA_MARGIN): Area {
  const [west, south, east, north] = bounds;
  const spanLng = Math.max(east - west, 1e-6);
  const spanLat = Math.max(north - south, 1e-6);
  // A power of two, about a quarter of the screen: the grid gets finer as the person zooms in.
  const cell = 2 ** Math.floor(Math.log2(Math.max(spanLng, spanLat) * margin));
  const low = (value: number, pad: number, floor: number) =>
    clamp(Math.floor((value - pad) / cell) * cell, floor, -floor);
  const high = (value: number, pad: number, ceiling: number) =>
    clamp(Math.ceil((value + pad) / cell) * cell, -ceiling, ceiling);
  return {
    min_lat: round(low(south, spanLat * margin, -90)),
    max_lat: round(high(north, spanLat * margin, 90)),
    min_lng: round(low(west, spanLng * margin, -180)),
    max_lng: round(high(east, spanLng * margin, 180)),
  };
}

/** The exact box a screen shows, with no margin and no grid: what "in view" means for a count or for the list. */
export function areaOfBounds(bounds: Bounds): Area {
  const [west, south, east, north] = bounds;
  return {
    min_lat: round(clamp(south, -90, 90)),
    max_lat: round(clamp(north, -90, 90)),
    min_lng: round(clamp(west, -180, 180)),
    max_lng: round(clamp(east, -180, 180)),
  };
}

/** Whether a point is on screen (the edges count). */
export function inBounds(lat: number, lng: number, bounds: Bounds): boolean {
  const [west, south, east, north] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

const sizeOf = (area: Area) =>
  (area.max_lat - area.min_lat) * (area.max_lng - area.min_lng);

/** Whether everything on screen is inside the area. */
export function areaContains(area: Area, bounds: Bounds): boolean {
  const [west, south, east, north] = bounds;
  return (
    south >= area.min_lat &&
    north <= area.max_lat &&
    west >= area.min_lng &&
    east <= area.max_lng
  );
}

/**
 * The area to use now. The one already loaded stays while it still covers the screen and is not absurdly bigger
 * than it (zooming in a little should not reload); otherwise a new one is worked out. Returns the very same object
 * when nothing changes, so a state update with it re-renders nothing.
 *
 * `complete`: every listing in the loaded area has arrived. Then zooming in cannot reveal anything new, so the
 * area is kept much longer. When the answer was cut short (a crowded city), zooming in asks again for the smaller
 * area, which is how the listings that did not fit the first time show up.
 */
export function nextArea(
  current: Area | null,
  bounds: Bounds,
  complete = false,
): Area {
  if (current && areaContains(current, bounds)) {
    const [west, south, east, north] = bounds;
    const onScreen = Math.max((east - west) * (north - south), 1e-12);
    const limit = complete ? MAX_OVERFETCH_COMPLETE : MAX_OVERFETCH;
    if (sizeOf(current) <= onScreen * limit) return current;
  }
  const next = areaFor(bounds);
  // The same box again: hand back the old object so nothing re-renders.
  return current && sameArea(current, next) ? current : next;
}

const sameArea = (a: Area, b: Area) =>
  a.min_lat === b.min_lat &&
  a.max_lat === b.max_lat &&
  a.min_lng === b.min_lng &&
  a.max_lng === b.max_lng;
