import { AFGHANISTAN_BOUNDS, type Property } from '@bongah/shared-types';
import type { Coordinate } from './geo';

/**
 * Plot outlines for the map: reading what the API sends, and answering "which plot is under this tap?".
 *
 * The outline arrives as GeoJSON ([longitude, latitude], outer ring first), the shape agvmap stores, either as
 * a bare Polygon or wrapped in a Feature. It comes from outside the app, so it is checked before it is drawn:
 * one malformed plot is dropped without touching the others.
 */

/** One linear ring of [longitude, latitude] pairs, first point repeated at the end. */
export type Ring = [number, number][];

export interface Plot {
  /** The listing the plot belongs to. */
  id: string;
  property: Property;
  /** Outer ring first, then any holes. */
  rings: Ring[];
  /** [west, south, east, north] of the outer ring. */
  bbox: [number, number, number, number];
}

/** A plot is a few dozen corners at most; this only stops a broken payload from being walked forever. */
export const MAX_PLOT_VERTICES = 2000;
/** More outlines than this would not be readable on a phone anyway, and each one costs the native renderer. */
export const MAX_PLOTS = 300;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readRing(value: unknown): Ring | null {
  if (!Array.isArray(value)) return null;
  const ring: Ring = [];
  for (const position of value) {
    if (!Array.isArray(position)) return null;
    const [lng, lat] = position as unknown[];
    if (!isNumber(lng) || !isNumber(lat)) return null;
    if (
      lat < AFGHANISTAN_BOUNDS.minLat ||
      lat > AFGHANISTAN_BOUNDS.maxLat ||
      lng < AFGHANISTAN_BOUNDS.minLng ||
      lng > AFGHANISTAN_BOUNDS.maxLng
    ) {
      return null;
    }
    ring.push([lng, lat]);
  }
  // Closed rings repeat the first point; accept an open one by closing it.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  // A triangle is three corners plus the closing point.
  return ring.length >= 4 ? ring : null;
}

/** The rings of a Polygon or a Feature holding one, or null if it is anything else or has a bad ring. */
export function readBoundary(value: unknown): Ring[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const node = value as { type?: unknown; geometry?: unknown };
  if (node.type === 'Feature') return readBoundary(node.geometry);
  const polygon = value as { type?: unknown; coordinates?: unknown };
  if (polygon.type !== 'Polygon' || !Array.isArray(polygon.coordinates)) {
    return null;
  }
  const rings: Ring[] = [];
  let vertices = 0;
  for (const raw of polygon.coordinates) {
    const ring = readRing(raw);
    if (!ring) return null;
    vertices += ring.length;
    if (vertices > MAX_PLOT_VERTICES) return null;
    rings.push(ring);
  }
  return rings.length > 0 ? rings : null;
}

function bboxOf(ring: Ring): Plot['bbox'] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/** The plots among these listings that have a usable outline (at most `MAX_PLOTS`). */
export function buildPlots(properties: readonly Property[]): Plot[] {
  const plots: Plot[] = [];
  for (const property of properties) {
    if (plots.length >= MAX_PLOTS) break;
    if (!property.boundary) continue;
    const rings = readBoundary(property.boundary);
    if (!rings) continue;
    plots.push({
      id: property.id,
      property,
      rings,
      bbox: bboxOf(rings[0]),
    });
  }
  return plots;
}

/** Plots as a GeoJSON collection for one map source. */
export function plotFeatures(
  plots: readonly Plot[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: plots.map(plot => ({
      type: 'Feature',
      id: plot.id,
      geometry: { type: 'Polygon', coordinates: plot.rings },
      properties: { id: plot.id },
    })),
  };
}

/** Ray casting: whether the point is inside the ring. Edges count as inside only by luck, which is fine for a tap. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const bboxArea = (bbox: Plot['bbox']) =>
  (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);

/**
 * The listing whose plot contains this point. Where plots overlap (a block of flats inside a larger lot) the
 * smallest one wins, because that is the one the person was aiming at. Cheap: a bounding box rules most
 * plots out before any geometry is walked.
 */
export function plotAt(
  plots: readonly Plot[],
  point: Coordinate,
): Property | null {
  const { latitude: lat, longitude: lng } = point;
  let best: Plot | null = null;
  for (const plot of plots) {
    const [west, south, east, north] = plot.bbox;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const [outer, ...holes] = plot.rings;
    if (!inRing(lng, lat, outer)) continue;
    if (holes.some(hole => inRing(lng, lat, hole))) continue;
    if (!best || bboxArea(plot.bbox) < bboxArea(best.bbox)) best = plot;
  }
  return best ? best.property : null;
}
