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
