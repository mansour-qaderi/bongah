import { pickRoute, routeFromOsrm, type Route } from '../src/map/routing';
import { areaOfBounds, inBounds } from '../src/map/viewport';
import { SATELLITE_STYLE_URL } from '../src/config';
import {
  SATELLITE_MAP_STYLE,
  BASE_MAP_STYLE,
  FALLBACK_MAP_STYLE,
  styleFor,
} from '../src/map/style';
import {
  resetMapStyleForTests,
  setMapStyle,
} from '../src/map/mapStyleStore';
import { kv, KV_KEYS } from '../src/storage/kv';

const route = (distanceM: number, durationS: number): Route => ({
  source: 'osrm',
  line: [
    [69, 34],
    [69.01, 34.01],
  ],
  distanceM,
  durationS,
});

describe('the fastest direct route', () => {
  it('takes the quickest of several, and among near-equal ones the shorter', () => {
    expect(pickRoute([])).toBeNull();
    // 300 s vs 200 s: the quicker one wins even though it is longer.
    expect(pickRoute([route(2000, 300), route(5000, 200)])?.durationS).toBe(200);
    // 210 s vs 200 s (within 10 %): the shorter road, not the faster by a hair.
    expect(pickRoute([route(5000, 200), route(2000, 210)])?.distanceM).toBe(2000);
    // 230 s vs 200 s (15 % slower): not a tie.
    expect(pickRoute([route(5000, 200), route(2000, 230)])?.distanceM).toBe(5000);
  });

  it('reads every route OSRM offers and picks among them', () => {
    const geometry = {
      coordinates: [
        [69, 34],
        [69.01, 34.01],
      ],
    };
    const picked = routeFromOsrm({
      code: 'Ok',
      routes: [
        { distance: 6000, duration: 400, geometry },
        { distance: 3000, duration: 380, geometry },
        { distance: 100, duration: 10, geometry: { coordinates: [[1, 2]] } }, // unreadable: skipped
      ],
    });
    expect(picked?.distanceM).toBe(3000);
  });
});

describe('what is in view', () => {
  const view: [number, number, number, number] = [69.1, 34.4, 69.2, 34.5];

  it('counts a point on screen, edges included, and not one outside', () => {
    expect(inBounds(34.45, 69.15, view)).toBe(true);
    expect(inBounds(34.4, 69.1, view)).toBe(true);
    expect(inBounds(34.6, 69.15, view)).toBe(false);
    expect(inBounds(34.45, 69.25, view)).toBe(false);
  });

  it('asks the API for exactly the screen, with no margin', () => {
    expect(areaOfBounds(view)).toEqual({
      min_lat: 34.4,
      max_lat: 34.5,
      min_lng: 69.1,
      max_lng: 69.2,
    });
  });
});

describe('the base maps', () => {
  it('has a street map and a satellite one, each its own style object', () => {
    expect(styleFor('street')).toBe(BASE_MAP_STYLE);
    expect(styleFor('satellite')).toBe(SATELLITE_MAP_STYLE);
    expect(SATELLITE_MAP_STYLE).not.toBe(BASE_MAP_STYLE);
  });

  it('draws the satellite map from Mapbox Satellite Streets: the photographs with the roads and names over them', () => {
    expect(SATELLITE_STYLE_URL).toBe('mapbox://styles/mapbox/satellite-streets-v12');
    expect(SATELLITE_MAP_STYLE).toBe(SATELLITE_STYLE_URL);
    // A vector style read by address: the app does not ask a raster server for photographs of its own any more.
    expect(typeof SATELLITE_MAP_STYLE).toBe('string');
  });

  it('puts the plain street tiles in its place only when Mapbox cannot be used', () => {
    expect(styleFor('satellite')).toBe(SATELLITE_MAP_STYLE);
    expect(styleFor('satellite', true)).toBe(FALLBACK_MAP_STYLE);
  });

  it('remembers the choice on the phone', async () => {
    resetMapStyleForTests();
    await setMapStyle('satellite');
    expect(await kv.get(KV_KEYS.mapStyle)).toBe('satellite');
    await setMapStyle('street');
    expect(await kv.get(KV_KEYS.mapStyle)).toBe('street');
  });
});
