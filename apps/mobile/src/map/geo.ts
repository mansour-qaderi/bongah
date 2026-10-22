import { AFGHANISTAN_BOUNDS, type Property } from '@bongah/shared-types';
import type { Province } from '../constants/provinces';

/** A point as the app and the API think of it. (MapLibre wants [longitude, latitude]; see toLngLat.) */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** [longitude, latitude]: MapLibre's order, the opposite of how people say it. */
export type LngLat = [longitude: number, latitude: number];

/** Where a map is looking. */
export interface MapCamera {
  center: LngLat;
  zoom: number;
  /**
   * Space the map should not count as visible (a card covering the bottom), so the centre is the middle of
   * what the person can actually see.
   */
  padding?: { bottom?: number };
  /**
   * Change it to fly to the same place again (e.g. "my location" tapped after panning away), which a camera
   * with unchanged numbers would otherwise ignore.
   */
  nonce?: number;
}

/** Distance between two points in metres (haversine; plenty for a drive across the city). */
export function metresBetween(a: LngLat, b: LngLat): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const toLngLat = (c: Coordinate): LngLat => [c.longitude, c.latitude];
export const fromLngLat = ([longitude, latitude]: LngLat): Coordinate => ({
  latitude,
  longitude,
});

/** The whole country on a phone-sized map. */
export const AFGHANISTAN_CAMERA: MapCamera = {
  center: [67.7, 33.9],
  zoom: 4.8,
};

/** A city-sized view around a province's centre. */
export const provinceCamera = (province: Province): MapCamera => ({
  center: [province.lng, province.lat],
  zoom: 9,
});

/** Close enough to tell which street a pin is on. */
export const PIN_ZOOM = 15;
export const cameraAt = (
  c: Coordinate,
  zoom: number = PIN_ZOOM,
): MapCamera => ({
  center: toLngLat(c),
  zoom,
});

/**
 * A camera that has all of `points` in view inside a box of `width` x `height` points, with `margin` points to spare at
 * every edge (Web Mercator, like the map's own tiles). One point is looked at from `maxZoom`.
 */
export function cameraFitting(
  points: readonly Coordinate[],
  width: number,
  height: number,
  { margin = 36, maxZoom = 17, minZoom = 3 } = {},
): MapCamera {
  if (points.length === 0) return AFGHANISTAN_CAMERA;
  const mercatorY = (latitude: number) => {
    const sin = Math.sin((latitude * Math.PI) / 180);
    return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  };
  const xs = points.map(p => (p.longitude + 180) / 360);
  const ys = points.map(p => mercatorY(p.latitude));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  // At zoom z the world is 512 * 2^z points wide (the map's tiles are 512 points).
  const fitX = Math.log2(Math.max(width - 2 * margin, 1) / (512 * spanX));
  const fitY = Math.log2(Math.max(height - 2 * margin, 1) / (512 * spanY));
  const zoom = Math.max(minZoom, Math.min(maxZoom, fitX, fitY));
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const latitude =
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * centreY))) * 180) / Math.PI;
  return { center: [centreX * 360 - 180, latitude], zoom };
}

/**
 * Whether a tapped point is somewhere a listing can be. Mirrors the API's check (a bounding box
 * around Afghanistan, not its border), so a pin the app lets through is never refused for its position.
 */
export function isInsideAfghanistan(c: Coordinate): boolean {
  return (
    c.latitude >= AFGHANISTAN_BOUNDS.minLat &&
    c.latitude <= AFGHANISTAN_BOUNDS.maxLat &&
    c.longitude >= AFGHANISTAN_BOUNDS.minLng &&
    c.longitude <= AFGHANISTAN_BOUNDS.maxLng
  );
}

export type PinnedProperty = Property & { lat: number; lng: number };

/** Listings without an exact pin cannot be drawn on the map. */
export const hasPin = (property: Property): property is PinnedProperty =>
  property.lat !== null && property.lng !== null;

/** One map point per pinned listing; `selected` (1/0) lets the layer colour the chosen one. */
export function pinFeatures(
  properties: Property[],
  selectedId?: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; selected: 0 | 1 }> {
  return {
    type: 'FeatureCollection',
    features: properties.filter(hasPin).map(property => ({
      type: 'Feature',
      id: property.id,
      geometry: { type: 'Point', coordinates: [property.lng, property.lat] },
      properties: {
        id: property.id,
        selected: property.id === selectedId ? 1 : 0,
      },
    })),
  };
}
