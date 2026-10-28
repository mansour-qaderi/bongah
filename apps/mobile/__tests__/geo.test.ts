import type { Property } from '@bongah/shared-types';
import {
  MAP_FALLBACK_TILE_MAX_ZOOM,
  MAP_FALLBACK_TILE_URL,
  MAP_STYLE_API_URL,
  SATELLITE_STYLE_API_URL,
  SATELLITE_STYLE_URL,
  MAP_STYLE_URL,
  MAP_TILE_MAX_ZOOM,
} from '../src/config';
import {
  AFGHANISTAN_CAMERA,
  fromLngLat,
  hasPin,
  isInsideAfghanistan,
  pinFeatures,
  toLngLat,
} from '../src/map/geo';
import { BASE_MAP_STYLE, FALLBACK_MAP_STYLE, rasterStyle, styleFor } from '../src/map/style';

const listing = (overrides: Partial<Property>): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
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
  it('converts to the map order ([longitude, latitude]) and back', () => {
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
  it('is Mapbox Streets v12, fetched by address, with no token written into the source', () => {
    expect(BASE_MAP_STYLE).toBe(MAP_STYLE_URL);
    expect(MAP_STYLE_URL).toBe('mapbox://styles/mapbox/streets-v12');
    expect(MAP_STYLE_API_URL).toBe('https://api.mapbox.com/styles/v1/mapbox/streets-v12');
    expect(MAP_STYLE_URL + MAP_STYLE_API_URL).not.toMatch(/access_token|pk\./);
    expect(styleFor('street')).toBe(MAP_STYLE_URL);
  });

  it('uses the label-adjusted Mapbox style when there is one, for the street map and for the satellite one', () => {
    const adjusted = { version: 8, sources: {}, layers: [] };
    expect(styleFor('street', false, adjusted)).toBe(adjusted);
    expect(styleFor('satellite', false, adjusted)).toBe(adjusted);
    expect(styleFor('street', true, adjusted)).toBe(FALLBACK_MAP_STYLE);
    expect(styleFor('satellite', true, adjusted)).toBe(FALLBACK_MAP_STYLE);
  });

  it('is Mapbox Satellite Streets v12 for the satellite view, fetched by address, with no token written into it', () => {
    expect(SATELLITE_STYLE_URL).toBe('mapbox://styles/mapbox/satellite-streets-v12');
    expect(SATELLITE_STYLE_API_URL).toBe('https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12');
    expect(SATELLITE_STYLE_URL + SATELLITE_STYLE_API_URL).not.toMatch(/access_token|pk\./);
    expect(styleFor('satellite')).toBe(SATELLITE_STYLE_URL);
  });

  it('no longer uses CARTO (it asks for a key) anywhere', () => {
    const everything = JSON.stringify([MAP_STYLE_URL, MAP_STYLE_API_URL, MAP_FALLBACK_TILE_URL, FALLBACK_MAP_STYLE]);
    expect(everything).not.toMatch(/carto/i);
  });

  it('may be zoomed well past the stored tile levels: vector tiles are drawn larger, not stretched', () => {
    expect(MAP_TILE_MAX_ZOOM).toBeGreaterThanOrEqual(19);
  });

  it('has a plain raster fallback: one raster layer fed by one tile server and nothing else', () => {
    const style = rasterStyle();
    expect(style.layers).toHaveLength(1);
    expect(Object.keys(style.sources)).toEqual(['basemap']);
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      tiles: [MAP_FALLBACK_TILE_URL],
      tileSize: 256,
      maxzoom: MAP_FALLBACK_TILE_MAX_ZOOM,
    });
    expect(MAP_FALLBACK_TILE_URL).not.toMatch(/key|token/i);
    // No vector/glyph/sprite endpoints: the only network dependency is the tile server.
    expect(style).not.toHaveProperty('glyphs');
    expect(style).not.toHaveProperty('sprite');
  });

  it('uses the fallback only after the style failed', () => {
    expect(styleFor('street', true)).toBe(FALLBACK_MAP_STYLE);
    expect(styleFor('street', false)).toBe(BASE_MAP_STYLE);
    expect(styleFor('satellite', true)).toBe(FALLBACK_MAP_STYLE);
  });
});
