import {
  clusterPoints,
  CLUSTER_RADIUS_PX,
  inBounds,
  toPixels,
  type MapPoint,
} from '../src/map/cluster';

const point = (key: string, lat: number, lng: number): MapPoint => ({
  key,
  lat,
  lng,
});

// About 1 km of latitude.
const KM = 0.009;
const KABUL = { lat: 34.5281, lng: 69.1723 };

describe('toPixels', () => {
  it('puts the equator and the prime meridian in the middle of the world map', () => {
    expect(toPixels(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(toPixels(0, 0, 3)).toEqual({ x: 1024, y: 1024 });
  });
  it('puts the west edge at x = 0 and north is up (smaller y)', () => {
    expect(toPixels(0, -180, 2).x).toBe(0);
    expect(toPixels(40, 0, 4).y).toBeLessThan(toPixels(10, 0, 4).y);
  });
  it('survives the poles', () => {
    expect(Number.isFinite(toPixels(90, 0, 5).y)).toBe(true);
    expect(Number.isFinite(toPixels(-90, 0, 5).y)).toBe(true);
  });
});

describe('clusterPoints', () => {
  const near = [
    point('a', KABUL.lat, KABUL.lng),
    point('b', KABUL.lat + KM, KABUL.lng), // ~1 km north
    point('c', KABUL.lat + 3 * KM, KABUL.lng), // ~3 km north
  ];

  it('groups points that would overlap on screen and splits them as the map zooms in', () => {
    const sizes = (zoom: number) =>
      clusterPoints(near, zoom)
        .map(c => c.items.length)
        .sort();
    expect(sizes(9)).toEqual([3]); // zoomed out: one pile
    expect(sizes(16)).toEqual([1, 1, 1]); // zoomed in: separate markers
  });

  it('keeps every point in exactly one group', () => {
    for (const zoom of [4, 8, 11, 13, 15, 18]) {
      const keys = clusterPoints(near, zoom)
        .flatMap(c => c.items.map(i => i.key))
        .sort();
      expect(keys).toEqual(['a', 'b', 'c']);
    }
  });

  it('is the same whatever order the points arrive in', () => {
    const shuffled = [near[2], near[0], near[1]];
    const shape = (list: MapPoint[]) =>
      clusterPoints(list, 12).map(c => [c.key, c.items.map(i => i.key).sort()]);
    expect(shape(shuffled)).toEqual(shape(near));
  });

  it('places a group at the average of its points', () => {
    const [group] = clusterPoints(
      [point('a', 34, 69), point('b', 34.002, 69.002)],
      10,
    );
    expect(group.items).toHaveLength(2);
    expect(group.lat).toBeCloseTo(34.001, 6);
    expect(group.lng).toBeCloseTo(69.001, 6);
  });

  it('never splits points at the very same spot (two listings in one building)', () => {
    const [group, ...rest] = clusterPoints(
      [point('a', 34.5, 69.1), point('b', 34.5, 69.1), point('c', 34.5, 69.1)],
      22,
    );
    expect(rest).toEqual([]);
    expect(group.items).toHaveLength(3);
  });

  it('merges neighbours that a fixed grid line would have separated', () => {
    // 60 m apart (about 2 px at zoom 12) on either side of any round-number latitude.
    const list = [point('a', 34.4997, 69.1), point('b', 34.5003, 69.1)];
    expect(clusterPoints(list, 12)).toHaveLength(1);
  });

  it('honours the radius: just outside it stays separate, just inside merges', () => {
    const zoom = 12;
    const a = point('a', 34.5, 69.1);
    const pxA = toPixels(a.lat, a.lng, zoom);
    // Find a latitude exactly `px` pixels north of a.
    const northBy = (px: number) => {
      let lo = 34.5;
      let hi = 35;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (pxA.y - toPixels(mid, a.lng, zoom).y < px) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    expect(
      clusterPoints(
        [a, point('b', northBy(CLUSTER_RADIUS_PX - 1), 69.1)],
        zoom,
      ),
    ).toHaveLength(1);
    expect(
      clusterPoints(
        [a, point('b', northBy(CLUSTER_RADIUS_PX + 1), 69.1)],
        zoom,
      ),
    ).toHaveLength(2);
  });

  it('copes with nothing and with one', () => {
    expect(clusterPoints([], 10)).toEqual([]);
    const [only] = clusterPoints([point('a', 34, 69)], 10);
    expect(only).toMatchObject({ key: 'a', lat: 34, lng: 69 });
  });
});

describe('inBounds', () => {
  const bounds: [number, number, number, number] = [68, 33, 70, 35];
  it('includes what is on screen and a margin just beyond it', () => {
    expect(inBounds(34, 69, bounds)).toBe(true);
    expect(inBounds(34, 70.3, bounds)).toBe(true); // within 25% of the width
    expect(inBounds(34, 70.6, bounds)).toBe(false);
    expect(inBounds(35.4, 69, bounds)).toBe(true);
    expect(inBounds(36, 69, bounds)).toBe(false);
  });
  it('can be strict', () => {
    expect(inBounds(34, 70.3, bounds, 0)).toBe(false);
  });
});
