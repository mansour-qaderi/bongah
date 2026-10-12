import type { Property } from '@bongah/shared-types';
import { MAP_TILE_URL } from '../src/config';
import {
  AFGHANISTAN_CAMERA,
  fromLngLat,
  hasPin,
  isInsideAfghanistan,
  pinFeatures,
  toLngLat,
} from '../src/map/geo';
import { rasterStyle } from '../src/map/style';

const listing = (overrides: Partial<Property>): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  title: 'x',
  description: 'x',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 1,
  currency: 'USD',
  area_sqm: 1,
  bedrooms: null,
  bathrooms: null,
  province: 'کابل',
  district: 'شهر نو',
  neighborhood: null,
  address: 'x',
  lat: 34.5,
  lng: 69.1,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('coordinates', () => {
  it('converts to MapLibre order ([longitude, latitude]) and back', () => {
    const kabul = { latitude: 34.53, longitude: 69.17 };
    expect(toLngLat(kabul)).toEqual([69.17, 34.53]);
    expect(fromLngLat([69.17, 34.53])).toEqual(kabul);
  });

  it('starts the country view inside Afghanistan', () => {
    expect(isInsideAfghanistan(fromLngLat(AFGHANISTAN_CAMERA.center))).toBe(
      true,
    );
  });

  it('refuses points the API would refuse', () => {
    expect(isInsideAfghanistan({ latitude: 34.5, longitude: 69.1 })).toBe(true);
    expect(isInsideAfghanistan({ latitude: 51.5, longitude: -0.12 })).toBe(
      false,
    );
    expect(isInsideAfghanistan({ latitude: 34.5, longitude: 120 })).toBe(false);
    // Swapped latitude/longitude is the classic mistake: it must not pass.
    expect(isInsideAfghanistan({ latitude: 69.1, longitude: 34.5 })).toBe(
      false,
    );
  });
});

describe('pins on the map', () => {
  it('draws only listings that have an exact pin, as [longitude, latitude] points', () => {
    const data = pinFeatures(
      [
        listing({ id: 'a', lat: 34.5, lng: 69.1 }),
        listing({ id: 'b', lat: null, lng: null }),
      ],
      'a',
    );
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.coordinates).toEqual([69.1, 34.5]);
    expect(data.features[0].properties).toEqual({ id: 'a', selected: 1 });
  });

  it('marks only the selected listing', () => {
    const data = pinFeatures([listing({ id: 'a' }), listing({ id: 'c' })], 'c');
    expect(data.features.map(f => f.properties.selected)).toEqual([0, 1]);
  });

  it('narrows listings with a pin', () => {
    expect(hasPin(listing({}))).toBe(true);
    expect(hasPin(listing({ lat: null, lng: null }))).toBe(false);
  });
});

describe('base map style', () => {
  it('is a single raster layer fed by the configured tile server and nothing else', () => {
    const style = rasterStyle();
    expect(style.layers).toHaveLength(1);
    expect(Object.keys(style.sources)).toEqual(['basemap']);
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      tiles: [MAP_TILE_URL],
    });
    // No vector/glyph/sprite endpoints: the only network dependency is the tile server.
    expect(style).not.toHaveProperty('glyphs');
    expect(style).not.toHaveProperty('sprite');
  });

  it('uses OpenStreetMap by default, with no key in the URL', () => {
    expect(MAP_TILE_URL).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    expect(MAP_TILE_URL).not.toMatch(/key|token/i);
  });
});
