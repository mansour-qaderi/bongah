import {
  createPropertySchema,
  plotBoundarySchema,
  ringAreaSqm,
  ringCentroid,
  ringContains,
  ringSelfIntersects,
  updatePropertySchema,
  type LngLatPair,
} from '@bongah/validation';
import { readBoundary } from './property.mapper.js';

/** A square about `side` metres wide at Zaranj (30.96 N): a degree of latitude is 110.9 km, of longitude 95.2 km there. */
function square(side: number, [lng, lat]: LngLatPair = [61.86, 30.96]): LngLatPair[] {
  const dLat = side / 110_900;
  const dLng = side / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng, lat],
    [lng + dLng, lat],
    [lng + dLng, lat + dLat],
    [lng, lat + dLat],
    [lng, lat],
  ];
}

const listing = {
  title: 'زمین در زرنج',
  description: 'زمین هموار',
  type: 'LAND',
  deal_type: 'SALE',
  price: 2_500_000,
  currency: 'AFGHANI',
  area_sqm: 2000,
  province: 'نیمروز',
  lat: 30.961,
  lng: 61.861,
};

describe('plot geometry', () => {
  it('measures a 100 m square as about 10,000 m², whichever way it is drawn', () => {
    const ring = square(100);
    expect(ringAreaSqm(ring)).toBeGreaterThan(9_900);
    expect(ringAreaSqm(ring)).toBeLessThan(10_100);
    expect(ringAreaSqm([...ring].reverse())).toBeCloseTo(ringAreaSqm(ring), 6);
    // Open or closed makes no difference.
    expect(ringAreaSqm(ring.slice(0, -1))).toBeCloseTo(ringAreaSqm(ring), 6);
  });

  it('tells a bow tie from a plain outline', () => {
    const [a, b, c, d] = square(50);
    expect(ringSelfIntersects([a, b, c, d])).toBe(false);
    expect(ringSelfIntersects([a, c, b, d])).toBe(true);
    expect(ringSelfIntersects([a, b, c])).toBe(false);
  });

  it('finds the middle of the area and whether a point is inside', () => {
    const ring = square(100);
    const middle = ringCentroid(ring)!;
    expect(ringContains(ring, middle)).toBe(true);
    expect(ringContains(ring, [61.0, 31.0])).toBe(false);
  });
});

describe('plotBoundarySchema', () => {
  it('closes an open ring, drops a double tap and rounds to about a centimetre', () => {
    const [a, b, c, d] = square(60);
    const parsed = plotBoundarySchema.parse({
      type: 'Polygon',
      coordinates: [[a, b, b, [c[0] + 1e-9, c[1]], d]],
    });
    expect(parsed.coordinates[0]).toHaveLength(5);
    expect(parsed.coordinates[0][0]).toEqual(parsed.coordinates[0][4]);
    expect(parsed.coordinates[0][2][0]).toBe(Math.round(c[0] * 1e7) / 1e7);
  });

  it.each([
    ['two corners', { type: 'Polygon', coordinates: [square(60).slice(0, 2)] }],
    ['a hole', { type: 'Polygon', coordinates: [square(60), square(10)] }],
    ['a crossing', { type: 'Polygon', coordinates: [[square(60)[0], square(60)[2], square(60)[1], square(60)[3]]] }],
    ['a speck (2 m)', { type: 'Polygon', coordinates: [square(2)] }],
    ['a corner in Iraq', { type: 'Polygon', coordinates: [[[40.5, 30.9], ...square(60).slice(1)]] }],
    ['a point', { type: 'Point', coordinates: [61.86, 30.96] }],
  ])('refuses %s', (_name, value) => {
    expect(plotBoundarySchema.safeParse(value).success).toBe(false);
  });
});

describe('a listing with a plot', () => {
  it('is accepted with a pin, and the outline comes out normalised', () => {
    const parsed = createPropertySchema.parse({ ...listing, boundary: { type: 'Polygon', coordinates: [square(45).slice(0, -1)] } });
    expect(parsed.boundary?.coordinates[0]).toHaveLength(5);
  });

  it('is refused without a pin: the map finds listings by their pin', () => {
    const { lat: _lat, lng: _lng, ...noPin } = listing;
    const result = createPropertySchema.safeParse({ ...noPin, address: 'زرنج، ناحیه ۵', boundary: { type: 'Polygon', coordinates: [square(45)] } });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('boundary');
  });

  it('can be removed on an edit with null', () => {
    expect(updatePropertySchema.parse({ boundary: null })).toEqual({ boundary: null });
  });
});

describe('readBoundary (what the API sends)', () => {
  it('passes a stored Polygon and drops anything else', () => {
    const polygon = { type: 'Polygon', coordinates: [square(45)] };
    expect(readBoundary(polygon)).toEqual(polygon);
    expect(readBoundary(null)).toBeNull();
    expect(readBoundary({ type: 'LineString', coordinates: [] })).toBeNull();
    expect(readBoundary([1, 2])).toBeNull();
  });
});
