import type { Property } from '@bongah/shared-types';
import {
  MAX_PLOTS,
  MAX_PLOT_VERTICES,
  buildPlots,
  plotAt,
  plotFeatures,
  readBoundary,
} from '../src/map/plots';

// A square about 110 m on a side in Kabul: [lng, lat] corners, closed.
const square = (lng = 69.17, lat = 34.52, size = 0.001) => [
  [lng, lat],
  [lng + size, lat],
  [lng + size, lat + size],
  [lng, lat + size],
  [lng, lat],
];
const polygon = (...rings: number[][][]) => ({
  type: 'Polygon' as const,
  coordinates: rings,
});

const property = (id: string, boundary: unknown): Property =>
  ({ id, boundary } as unknown as Property);

describe('readBoundary', () => {
  it('reads a GeoJSON Polygon', () => {
    const rings = readBoundary(polygon(square()));
    expect(rings).toHaveLength(1);
    expect(rings![0]).toHaveLength(5);
    expect(rings![0][0]).toEqual([69.17, 34.52]);
  });

  it('reads a Feature wrapping a Polygon, the way agvmap stores a plot', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: polygon(square()),
    };
    expect(readBoundary(feature)).toHaveLength(1);
  });

  it('closes an open ring instead of refusing it', () => {
    const open = square().slice(0, 4);
    const rings = readBoundary(polygon(open))!;
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][4]).toEqual(rings[0][0]);
  });

  it('keeps holes after the outer ring and ignores a third (altitude) number', () => {
    const rings = readBoundary(
      polygon(
        square().map(([x, y]) => [x, y, 1800]),
        square(69.1703, 34.5203, 0.0004),
      ),
    )!;
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([69.17, 34.52]);
  });

  it.each([
    ['nothing', null],
    ['a string', 'POLYGON((0 0))'],
    ['another geometry', { type: 'Point', coordinates: [69.1, 34.5] }],
    ['a MultiPolygon', { type: 'MultiPolygon', coordinates: [[square()]] }],
    ['no rings', polygon()],
    [
      'a ring with two corners',
      polygon([
        [69.1, 34.5],
        [69.2, 34.6],
      ]),
    ],
    [
      'a non-number',
      polygon([
        [69.1, 34.5],
        [69.2, NaN],
        [69.3, 34.6],
        [69.1, 34.5],
      ]),
    ],
    [
      'a text coordinate',
      polygon([
        [69.1, 34.5],
        ['69.2', 34.6] as unknown as number[],
        [69.3, 34.7],
        [69.1, 34.5],
      ]),
    ],
    ['a point outside Afghanistan', polygon(square(2.35, 48.85))],
    ['latitude and longitude swapped', polygon(square(34.52, 69.17))],
    [
      'one bad ring among good ones',
      polygon(square(), [
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ],
  ])('rejects %s', (_name, value) => {
    expect(readBoundary(value)).toBeNull();
  });

  it('refuses an outline with an absurd number of corners', () => {
    const big = Array.from({ length: MAX_PLOT_VERTICES + 10 }, (_, i) => [
      69.17 + (i % 100) * 1e-6,
      34.52 + Math.floor(i / 100) * 1e-6,
    ]);
    expect(readBoundary(polygon(big))).toBeNull();
  });
});

describe('buildPlots', () => {
  it('keeps listings with a good outline and drops the rest without touching them', () => {
    const plots = buildPlots([
      property('a', polygon(square())),
      property('b', null),
      property('c', undefined),
      property('d', { type: 'Polygon', coordinates: 'oops' }),
      property('e', polygon(square(69.2, 34.55))),
    ]);
    expect(plots.map(p => p.id)).toEqual(['a', 'e']);
    expect(plots[0].bbox).toEqual([69.17, 34.52, 69.171, 34.521]);
    expect(plots[0].property.id).toBe('a');
  });

  it('never returns more than MAX_PLOTS', () => {
    const many = Array.from({ length: MAX_PLOTS + 25 }, (_, i) =>
      property(`p${i}`, polygon(square())),
    );
    expect(buildPlots(many)).toHaveLength(MAX_PLOTS);
  });
});

describe('plotFeatures', () => {
  it('makes one polygon feature per plot, tagged with the listing id', () => {
    const collection = plotFeatures(
      buildPlots([property('a', polygon(square()))]),
    );
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].geometry.type).toBe('Polygon');
    expect(collection.features[0].properties).toEqual({ id: 'a' });
    expect(collection.features[0].geometry.coordinates[0]).toHaveLength(5);
  });
  it('is empty for no plots', () => {
    expect(plotFeatures([]).features).toEqual([]);
  });
});

describe('plotAt', () => {
  const outer = buildPlots([
    property('big', polygon(square(69.17, 34.52, 0.01))),
    property('small', polygon(square(69.174, 34.524, 0.001))),
  ]);
  const at = (longitude: number, latitude: number) => ({ latitude, longitude });

  it('finds the listing whose plot contains the point', () => {
    expect(plotAt(outer, at(69.172, 34.522))?.id).toBe('big');
  });
  it('prefers the smallest plot where they overlap', () => {
    expect(plotAt(outer, at(69.1745, 34.5245))?.id).toBe('small');
  });
  it('finds nothing outside every plot, including inside a bounding box corner only', () => {
    expect(plotAt(outer, at(69.5, 34.9))).toBeNull();
    const triangle = buildPlots([
      property(
        't',
        polygon([
          [69.17, 34.52],
          [69.18, 34.52],
          [69.17, 34.53],
          [69.17, 34.52],
        ]),
      ),
    ]);
    // Inside the triangle's bounding box but beyond its slanted edge.
    expect(plotAt(triangle, at(69.179, 34.529))).toBeNull();
    expect(plotAt(triangle, at(69.172, 34.522))?.id).toBe('t');
  });
  it('treats a hole as outside', () => {
    const donut = buildPlots([
      property(
        'd',
        polygon(square(69.17, 34.52, 0.01), square(69.173, 34.523, 0.002)),
      ),
    ]);
    expect(plotAt(donut, at(69.174, 34.524))).toBeNull(); // in the hole
    expect(plotAt(donut, at(69.171, 34.521))?.id).toBe('d'); // in the ring
  });
  it('handles no plots', () => {
    expect(plotAt([], at(69.17, 34.52))).toBeNull();
  });
});
