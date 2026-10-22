import { pickRoute, routeFromOsrm, type Route } from '../src/map/routing';
import { areaOfBounds, inBounds } from '../src/map/viewport';
import {
  SATELLITE_MAP_STYLE,
  SATELLITE_TILE_MAX_ZOOM,
  BASE_MAP_STYLE,
  satelliteStyle,
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

  it('draws the photographs with the place names over them', () => {
    const style = satelliteStyle('https://x/{z}/{y}/{x}', 'https://y/{z}/{y}/{x}', 18);
    expect(style.layers.map(layer => layer.id)).toEqual(['imagery', 'labels']);
    expect(style.sources.imagery).toMatchObject({ type: 'raster', maxzoom: 18 });
    expect(style.sources.labels).toMatchObject({ type: 'raster' });
  });

  it('never asks the photographs for a level they do not have: past it the picture is stretched, not replaced by a grey "no data" tile', () => {
    // Esri answers a missing level with a grey placeholder (a normal 200 reply), so the app must not ask for it.
    expect(SATELLITE_TILE_MAX_ZOOM).toBeLessThanOrEqual(17);
    expect(SATELLITE_MAP_STYLE.sources.imagery).toMatchObject({ maxzoom: SATELLITE_TILE_MAX_ZOOM });
    expect(SATELLITE_MAP_STYLE.sources.labels).toMatchObject({ maxzoom: SATELLITE_TILE_MAX_ZOOM });
    // The map itself may still be zoomed in beyond it (the close view of a street is zoom 17).
    expect(SATELLITE_MAP_STYLE.layers.every(layer => layer.minzoom === undefined || layer.minzoom <= SATELLITE_TILE_MAX_ZOOM)).toBe(true);
  });

  it('remembers the choice on the phone', async () => {
    resetMapStyleForTests();
    await setMapStyle('satellite');
    expect(await kv.get(KV_KEYS.mapStyle)).toBe('satellite');
    await setMapStyle('street');
    expect(await kv.get(KV_KEYS.mapStyle)).toBe('street');
  });
});
