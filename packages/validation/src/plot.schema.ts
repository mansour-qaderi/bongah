import { z } from 'zod';
import {
  AFGHANISTAN_BOUNDS,
  GEO_PROVIDERS,
  PLACE_QUERY_MAX_LENGTH,
  PLOT_MAX_AREA_SQM,
  PLOT_MAX_VERTICES,
  PLOT_MIN_AREA_SQM,
} from '@bongah/shared-types';

/**
 * Plot outlines (the boundary an owner draws around a house, a piece of land or a garden) and the queries of the
 * place search. The geometry helpers live here, next to the schema, so the app's live area and the server's check
 * are one definition: a plot the app calls 2,000 m² is never refused by the server as 9 m².
 */

/** [longitude, latitude], GeoJSON's order. */
export type LngLatPair = [number, number];

/**
 * The radius turf (and therefore agvmap) uses for areas, so the same outline gets the same number in both apps.
 * (WGS84's equatorial radius; the mean radius would give about 0.2% less.)
 */
const EARTH_RADIUS_M = 6_378_137;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** The corners of a ring without its closing point (a ring may come closed or open). */
export function openRing(ring: readonly LngLatPair[]): LngLatPair[] {
  if (ring.length < 2) return [...ring];
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring];
}

/** The same ring closed (first point repeated at the end), as GeoJSON wants it. */
export function closeRing(ring: readonly LngLatPair[]): LngLatPair[] {
  const corners = openRing(ring);
  return corners.length === 0 ? [] : [...corners, [corners[0][0], corners[0][1]]];
}

/**
 * The area inside a ring on the Earth's surface, in m². The spherical-excess sum of Chamberlain & Duquette (2007),
 * which is what turf's `area` and `@mapbox/geojson-area` compute: exact enough for a plot (well under 0.5% for
 * anything smaller than a province) and independent of the ring's direction.
 */
export function ringAreaSqm(ring: readonly LngLatPair[]): number {
  const corners = openRing(ring);
  const n = corners.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = corners[i];
    const [lng2, lat2] = corners[(i + 1) % n];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Which side of the line a→b the point c is on: >0 left, <0 right, 0 on it. (Flat geometry is fine at plot scale.) */
const orientation = (a: LngLatPair, b: LngLatPair, c: LngLatPair) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const onSegment = (a: LngLatPair, b: LngLatPair, c: LngLatPair) =>
  Math.min(a[0], b[0]) <= c[0] &&
  c[0] <= Math.max(a[0], b[0]) &&
  Math.min(a[1], b[1]) <= c[1] &&
  c[1] <= Math.max(a[1], b[1]);

/** Whether the segments p1–p2 and q1–q2 touch or cross. */
export function segmentsIntersect(p1: LngLatPair, p2: LngLatPair, q1: LngLatPair, q2: LngLatPair): boolean {
  const d1 = orientation(q1, q2, p1);
  const d2 = orientation(q1, q2, p2);
  const d3 = orientation(p1, p2, q1);
  const d4 = orientation(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(q1, q2, p1)) return true;
  if (d2 === 0 && onSegment(q1, q2, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, q1)) return true;
  if (d4 === 0 && onSegment(p1, p2, q2)) return true;
  return false;
}

/**
 * Whether a ring's edges cross each other (a "bow tie"). Its area would mean nothing, so the form asks for the
 * corner to be moved and the server refuses it. Edges that share a corner are neighbours, not a crossing.
 * O(n²), which is nothing for PLOT_MAX_VERTICES corners.
 */
export function ringSelfIntersects(ring: readonly LngLatPair[]): boolean {
  const corners = openRing(ring);
  const n = corners.length;
  if (n < 4) return false; // a triangle cannot cross itself
  for (let i = 0; i < n; i++) {
    const a1 = corners[i];
    const a2 = corners[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a corner: skip them (the first and the last edge are neighbours too).
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a1, a2, corners[j], corners[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** The middle of a ring's area (not of its corners, which crowd where the outline is detailed). */
export function ringCentroid(ring: readonly LngLatPair[]): LngLatPair | null {
  const corners = openRing(ring);
  const n = corners.length;
  if (n === 0) return null;
  // Relative to the first corner, so the cross products stay well inside double precision.
  const [ox, oy] = corners[0];
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const x1 = corners[i][0] - ox;
    const y1 = corners[i][1] - oy;
    const x2 = corners[(i + 1) % n][0] - ox;
    const y2 = corners[(i + 1) % n][1] - oy;
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-18) {
    // A degenerate outline (all corners on one line): the plain average.
    const sum = corners.reduce<LngLatPair>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return [sum[0] / n, sum[1] / n];
  }
  return [ox + cx / (3 * twiceArea), oy + cy / (3 * twiceArea)];
}

/** Whether a point lies inside a ring (ray casting; a point exactly on an edge may go either way). */
export function ringContains(ring: readonly LngLatPair[], [x, y]: LngLatPair): boolean {
  const corners = openRing(ring);
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i];
    const [xj, yj] = corners[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Seven decimals is about a centimetre: more is noise from the screen, and it keeps the stored JSON short. */
const round7 = (value: number) => Math.round(value * 1e7) / 1e7;

const position = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lng, lat]) =>
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lat >= AFGHANISTAN_BOUNDS.minLat &&
      lat <= AFGHANISTAN_BOUNDS.maxLat &&
      lng >= AFGHANISTAN_BOUNDS.minLng &&
      lng <= AFGHANISTAN_BOUNDS.maxLng,
    'A corner of the plot is outside Afghanistan',
  )
  .transform(([lng, lat]): LngLatPair => [round7(lng), round7(lat)]);

/**
 * A plot outline: a GeoJSON Polygon with exactly one ring (no holes: nobody draws a courtyard out of their plot),
 * every corner inside Afghanistan, 3 to PLOT_MAX_VERTICES corners, edges that do not cross, and an area between
 * PLOT_MIN_AREA_SQM and PLOT_MAX_AREA_SQM. An open ring is accepted and closed; repeated corners (a double tap) are
 * dropped. The output is always `{ type: 'Polygon', coordinates: [closedRing] }`.
 */
export const plotBoundarySchema = z
  .strictObject({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(position).max(PLOT_MAX_VERTICES + 1)).length(1, 'A plot has one outline and no holes'),
  })
  .transform((value, ctx) => {
    const corners: LngLatPair[] = [];
    for (const point of openRing(value.coordinates[0])) {
      const previous = corners[corners.length - 1];
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) corners.push(point);
    }
    // The last corner may repeat the first once the doubles are gone (a ring sent closed after a double tap).
    const cleaned = openRing(corners);
    if (cleaned.length < 3) {
      ctx.addIssue({ code: 'custom', message: 'A plot needs at least 3 corners' });
      return z.NEVER;
    }
    if (cleaned.length > PLOT_MAX_VERTICES) {
      ctx.addIssue({ code: 'custom', message: `A plot has at most ${PLOT_MAX_VERTICES} corners` });
      return z.NEVER;
    }
    if (ringSelfIntersects(cleaned)) {
      ctx.addIssue({ code: 'custom', message: 'The edges of the plot cross each other' });
      return z.NEVER;
    }
    const area = ringAreaSqm(cleaned);
    if (area < PLOT_MIN_AREA_SQM || area > PLOT_MAX_AREA_SQM) {
      ctx.addIssue({ code: 'custom', message: 'The plot is too small or too large' });
      return z.NEVER;
    }
    return { type: 'Polygon' as const, coordinates: [closeRing(cleaned)] };
  });
export type PlotBoundaryInput = z.output<typeof plotBoundarySchema>;

// ───────────────────────── GET /geo/* query strings ─────────────────────────

const queryNumber = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,10})?$/, 'Not a coordinate')
    .transform(Number)
    .pipe(z.number().min(min).max(max));

/** A search session token (UUID-like, made by the app): Google and Mapbox bill a typed search and its pick as one. */
const sessionToken = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,64}$/, 'Bad session token')
  .optional();

/** GET /geo/autocomplete?q=…&lat=…&lng=…&session=… The point (optional) ranks nearer places first. */
export const placeAutocompleteQuerySchema = z
  .object({
    q: z
      .string()
      .transform((value) => value.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(2, 'At least 2 characters').max(PLACE_QUERY_MAX_LENGTH)),
    lat: queryNumber(AFGHANISTAN_BOUNDS.minLat, AFGHANISTAN_BOUNDS.maxLat).optional(),
    lng: queryNumber(AFGHANISTAN_BOUNDS.minLng, AFGHANISTAN_BOUNDS.maxLng).optional(),
    session: sessionToken,
    lang: z.enum(['prs', 'ps']).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'lat and lng must be sent together',
    path: ['lat'],
  });
export type PlaceAutocompleteQuery = z.output<typeof placeAutocompleteQuerySchema>;

/** GET /geo/places/:id?session=… */
export const placeDetailsQuerySchema = z.object({
  session: sessionToken,
  lang: z.enum(['prs', 'ps']).optional(),
});
export type PlaceDetailsQuery = z.output<typeof placeDetailsQuerySchema>;
/** The provider part of /geo/places/:provider/:id: an id is only readable by the provider that made it. */
export const geoProviderSchema = z.enum(GEO_PROVIDERS);
export const placeIdSchema = z.string().regex(/^[A-Za-z0-9_.:=-]{4,512}$/, 'Bad place id');

/** GET /geo/reverse?lat=…&lng=… */
export const reverseGeocodeQuerySchema = z.object({
  lat: queryNumber(AFGHANISTAN_BOUNDS.minLat, AFGHANISTAN_BOUNDS.maxLat),
  lng: queryNumber(AFGHANISTAN_BOUNDS.minLng, AFGHANISTAN_BOUNDS.maxLng),
  lang: z.enum(['prs', 'ps']).optional(),
});
export type ReverseGeocodeQuery = z.output<typeof reverseGeocodeQuerySchema>;

/** GET /geo/route?from_lat=…&from_lng=…&to_lat=…&to_lng=… (both ends inside Afghanistan). */
export const routeQuerySchema = z.object({
  from_lat: queryNumber(AFGHANISTAN_BOUNDS.minLat, AFGHANISTAN_BOUNDS.maxLat),
  from_lng: queryNumber(AFGHANISTAN_BOUNDS.minLng, AFGHANISTAN_BOUNDS.maxLng),
  to_lat: queryNumber(AFGHANISTAN_BOUNDS.minLat, AFGHANISTAN_BOUNDS.maxLat),
  to_lng: queryNumber(AFGHANISTAN_BOUNDS.minLng, AFGHANISTAN_BOUNDS.maxLng),
});
export type RouteQuery = z.output<typeof routeQuerySchema>;
