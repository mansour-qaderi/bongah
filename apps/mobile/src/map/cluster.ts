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
