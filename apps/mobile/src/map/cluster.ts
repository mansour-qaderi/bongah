/**
 * Groups map points that would overlap on screen, so a crowded area shows one tappable count instead
 * of a pile of markers.
 *
 * Greedy and deterministic: points are taken in key order; a point joins the first existing group whose
 * centre is within `radiusPx` on screen at this zoom, otherwise it starts a new group. A group's centre is the
 * average of its points. With a few hundred points this is instant, needs no dependency, and (unlike a fixed
 * grid) never splits two neighbours just because a grid line runs between them.
 */
export interface MapPoint {
  /** Unique and stable, e.g. "property:<id>". */
  key: string;
  lat: number;
  lng: number;
}

export interface Cluster<T extends MapPoint> {
  /** Stable while the same first point leads the group. */
  key: string;
  lat: number;
  lng: number;
  items: T[];
}

/** A marker is about this wide, so points closer than this overlap. */
export const CLUSTER_RADIUS_PX = 56;

const TILE = 256;

/** Web Mercator, in screen pixels at `zoom` (the projection the OpenStreetMap tiles use). */
export function toPixels(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function clusterPoints<T extends MapPoint>(
  points: readonly T[],
  zoom: number,
  radiusPx: number = CLUSTER_RADIUS_PX,
): Cluster<T>[] {
  const sorted = [...points].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const radiusSq = radiusPx * radiusPx;

  interface Group {
    first: T;
    items: T[];
    sumLat: number;
    sumLng: number;
    /** Centre in pixels, kept in step with the average. */
    x: number;
    y: number;
  }
  const groups: Group[] = [];

  for (const point of sorted) {
    const p = toPixels(point.lat, point.lng, zoom);
    let home: Group | undefined;
    for (const group of groups) {
      const dx = group.x - p.x;
      const dy = group.y - p.y;
      if (dx * dx + dy * dy <= radiusSq) {
        home = group;
        break;
      }
    }
    if (home) {
      home.items.push(point);
      home.sumLat += point.lat;
      home.sumLng += point.lng;
      const c = toPixels(
        home.sumLat / home.items.length,
        home.sumLng / home.items.length,
        zoom,
      );
      home.x = c.x;
      home.y = c.y;
    } else {
      groups.push({
        first: point,
        items: [point],
        sumLat: point.lat,
        sumLng: point.lng,
        x: p.x,
        y: p.y,
      });
    }
  }

  return groups.map(group => ({
    key: group.first.key,
    lat: group.sumLat / group.items.length,
    lng: group.sumLng / group.items.length,
    items: group.items,
  }));
}

/** [west, south, east, north], as MapLibre reports the visible area. */
export type Bounds = [number, number, number, number];

/** Whether a point is in `bounds` grown by `margin` (a fraction of the view's size), so markers just off-screen stay ready. */
export function inBounds(
  lat: number,
  lng: number,
  bounds: Bounds,
  margin = 0.25,
): boolean {
  const [west, south, east, north] = bounds;
  const padLng = (east - west) * margin;
  const padLat = (north - south) * margin;
  return (
    lng >= west - padLng &&
    lng <= east + padLng &&
    lat >= south - padLat &&
    lat <= north + padLat
  );
}

/** Zoom is clustered in half steps: finer than that changes nothing the eye can see. */
export const zoomStep = (zoom: number): number => Math.round(zoom * 2) / 2;

/** The middle of a group: the average of its points, which is also where its marker is drawn. */
export function centroid(points: readonly MapPoint[]): {
  latitude: number;
  longitude: number;
} {
  const count = Math.max(points.length, 1);
  return {
    latitude: points.reduce((sum, p) => sum + p.lat, 0) / count,
    longitude: points.reduce((sum, p) => sum + p.lng, 0) / count,
  };
}

/**
 * The zoom to fly to so that a cluster breaks up and its pins can be told apart, or null when no zoom up to
 * `maxZoom` does it (they are at the same spot): the caller then lists them instead.
 *
 * It searches in the same half steps the map clusters in, starting one step closer than `fromZoom`, and goes
 * half a step past the first split so the pins are clearly apart, not just touching.
 */
export function zoomToSeparate(
  points: readonly MapPoint[],
  fromZoom: number,
  maxZoom: number,
  radiusPx: number = CLUSTER_RADIUS_PX,
): number | null {
  if (points.length < 2) return null;
  for (let zoom = zoomStep(fromZoom) + 0.5; zoom <= maxZoom; zoom += 0.5) {
    if (clusterPoints(points, zoom, radiusPx).length > 1) {
      return Math.min(zoom + 0.5, maxZoom);
    }
  }
  return null;
}

/** What the map last told us about what it shows. */
export interface MapView {
  zoom: number;
  bounds: Bounds | null;
}

/**
 * Whether the map has moved enough that markers must be re-clustered and re-culled. A small pan changes
 * nothing the eye can see (markers just off-screen are already kept ready, see `inBounds`), so ignoring it
 * saves a full redraw of every marker. Any change of zoom step, or a shift of more than `tolerance` of the
 * view's size in any direction, counts.
 */
export function viewMoved(
  previous: MapView,
  next: MapView,
  tolerance = 0.15,
): boolean {
  if (zoomStep(previous.zoom) !== zoomStep(next.zoom)) return true;
  if (!previous.bounds || !next.bounds) return previous.bounds !== next.bounds;
  const [west, south, east, north] = previous.bounds;
  const spanLng = east - west;
  const spanLat = north - south;
  const [w, s, e, n] = next.bounds;
  return (
    Math.abs(w - west) > spanLng * tolerance ||
    Math.abs(e - east) > spanLng * tolerance ||
    Math.abs(s - south) > spanLat * tolerance ||
    Math.abs(n - north) > spanLat * tolerance
  );
}
