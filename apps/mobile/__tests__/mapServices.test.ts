import i18next from 'i18next';
import { initI18n } from '../src/i18n';
import { setAuthToken } from '../src/api/client';
import {
  describeSpot,
  newSearchSession,
  optionsFromPhoton,
  resolvePlace,
  suggestPlaces,
  zoomForCategory,
} from '../src/map/GeocodingService';
import {
  DETOUR_FACTOR,
  NEAR_TRIP_M,
  REROUTE_MIN_MOVE_M,
  findRoute,
  isDetour,
  routeFromOsrm,
  routeProgress,
  shouldReroute,
  straightRoute,
  toleranceFor,
  type Route,
  type RouteProgress,
} from '../src/map/routing';
import { nextFix, STANDSTILL_MPS, type LiveFix } from '../src/map/useLiveLocation';
import { formatDistance, formatEta, formatSpeed } from '../src/map/navFormat';
import { metresBetween, type LngLat } from '../src/map/geo';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  setAuthToken(null);
});
afterAll(() => setAuthToken(null));

/** A fetch Response the app's code reads (ok/status/json/text/headers). */
const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null },
});
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

describe('places', () => {
  beforeAll(() => initI18n());

  it('reads Photon rows inside Afghanistan with the wide parts as the subtitle', () => {
    const options = optionsFromPhoton({
      features: [
        {
          geometry: { coordinates: [61.862, 30.958] },
          properties: { osm_type: 'N', osm_id: 1, osm_key: 'amenity', osm_value: 'hospital', name: 'شفاخانه ملکی', city: 'زرنج', state: 'نیمروز' },
        },
        { geometry: { coordinates: [59.6, 36.3] }, properties: { osm_type: 'N', osm_id: 2, name: 'Mashhad' } },
        { geometry: { coordinates: [69.1, 34.5] }, properties: { osm_type: 'W', osm_id: 3, type: 'street', street: 'جاده میوند' } },
      ],
    });
    expect(options).toEqual([
      {
        id: 'N1',
        source: 'osm',
        title: 'شفاخانه ملکی',
        subtitle: 'زرنج، نیمروز',
        category: 'hospital',
        coordinate: { latitude: 30.958, longitude: 61.862 },
      },
      expect.objectContaining({ id: 'W3', title: 'جاده میوند', category: 'street' }),
    ]);
    expect(optionsFromPhoton(null)).toEqual([]);
  });

  it('asks Google / Mapbox through the API when signed in, and nothing else when it has an answer', async () => {
    setAuthToken('token');
    fetchMock.mockResolvedValueOnce(
      reply({
        data: [{ id: 'g1', provider: 'google', title: 'کافه براسان', subtitle: 'زرنج، نیمروز', category: 'cafe', lat: null, lng: null }],
      }),
    );
    const result = await suggestPlaces('کافه براسان', { near: { latitude: 30.96, longitude: 61.86 }, session: 's-1', language: 'prs' });
    expect(result).toEqual({
      status: 'ok',
      options: [{ id: 'g1', source: 'google', title: 'کافه براسان', subtitle: 'زرنج، نیمروز', category: 'cafe', coordinate: null }],
    });
    expect(urls()).toHaveLength(1);
    const url = new URL(urls()[0]);
    expect(url.pathname).toBe('/geo/autocomplete');
    expect(url.searchParams.get('q')).toBe('کافه براسان');
    expect(url.searchParams.get('lat')).toBe('30.96');
    expect(url.searchParams.get('session')).toBe('s-1');
  });

  it('falls back to Photon when the server has no key (503), and for a guest', async () => {
    setAuthToken('token');
    fetchMock
      .mockResolvedValueOnce(reply({ code: 'GEO_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(reply({ features: [{ geometry: { coordinates: [61.86, 30.96] }, properties: { osm_type: 'N', osm_id: 9, name: 'زرنج' } }] }));
    const result = await suggestPlaces('زرنج');
    expect(result.status === 'ok' && result.options.map(o => o.title)).toEqual(['زرنج']);
    expect(urls()[1]).toContain('photon.komoot.io');
    expect(urls()[1]).toContain('bbox=60.4,29.3,75,38.6');

    setAuthToken(null);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(reply({ features: [] }));
    await expect(suggestPlaces('شفاخانه')).resolves.toEqual({ status: 'ok', options: [] });
    expect(urls()).toHaveLength(1);
    expect(urls()[0]).toContain('photon');
  });

  it('says "failed" only when nobody could be asked, and asks nothing for one letter', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(suggestPlaces('کابل')).resolves.toEqual({ status: 'failed' });
    fetchMock.mockReset();
    await expect(suggestPlaces('ک')).resolves.toEqual({ status: 'ok', options: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up a chosen Google row with the same session and matches its province', async () => {
    setAuthToken('token');
    fetchMock.mockResolvedValueOnce(
      reply({ provider: 'google', title: 'کافه براسان', address: 'زرنج، نیمروز، افغانستان', lat: 30.96, lng: 61.86, province: 'Nimroz', district: 'Zaranj', neighborhood: null, street: null }),
    );
    const place = await resolvePlace(
      { id: 'g1', source: 'google', title: 'کافه براسان', subtitle: '', category: 'cafe', coordinate: null },
      { session: 's-1' },
    );
    expect(place).toMatchObject({
      coordinate: { latitude: 30.96, longitude: 61.86 },
      zoom: 17,
      title: 'کافه براسان',
      province: expect.objectContaining({ id: 'nimroz' }),
      provinceApproximate: false,
      district: 'Zaranj',
    });
    expect(new URL(urls()[0]).pathname).toBe('/geo/places/google/g1');
    expect(new URL(urls()[0]).searchParams.get('session')).toBe('s-1');
  });

  it('describes a spot from the server, or from Nominatim when the server cannot', async () => {
    setAuthToken('token');
    fetchMock.mockResolvedValueOnce(
      reply({ provider: 'google', title: 'x', address: 'x', lat: 34.53, lng: 69.17, province: 'کابل', district: 'ناحیه ۱۰', neighborhood: 'وزیر اکبرخان', street: 'سرک ۱۵' }),
    );
    await expect(describeSpot({ latitude: 34.53, longitude: 69.17 })).resolves.toEqual({
      answered: true,
      province: expect.objectContaining({ id: 'kabul' }),
      provinceApproximate: false,
      district: 'ناحیه ۱۰',
      neighborhood: 'وزیر اکبرخان',
      street: 'سرک ۱۵',
    });

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(reply({ code: 'GEO_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(reply({ address: { state: 'ولایت نیمروز', city: 'زرنج', road: 'سرک اصلی' } }));
    const guess = await describeSpot({ latitude: 30.96, longitude: 61.86 });
    expect(guess).toMatchObject({ answered: true, district: 'زرنج', street: 'سرک اصلی' });
    expect(guess.province?.id).toBe('nimroz');
    expect(urls()[1]).toContain('nominatim');
  });

  it('zooms to a building closer than to a town, and makes distinct session tokens', () => {
    expect(zoomForCategory('hospital')).toBe(17);
    expect(zoomForCategory('city')).toBe(12);
    expect(zoomForCategory(null)).toBe(17);
    const a = newSearchSession();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newSearchSession()).not.toBe(a);
  });
});

describe('routes', () => {
  const from = { latitude: 34.5, longitude: 69.1 };
  const to = { latitude: 34.52, longitude: 69.12 };

  it('takes the API route when signed in, then OSRM, then a straight line', async () => {
    setAuthToken('token');
    fetchMock.mockResolvedValueOnce(
      reply({ provider: 'google', distance_m: 3200, duration_s: 420, coordinates: [[69.1, 34.5], [69.11, 34.51], [69.12, 34.52]] }),
    );
    await expect(findRoute(from, to)).resolves.toMatchObject({ source: 'google', distanceM: 3200, durationS: 420 });

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(reply({ code: 'GEO_UNAVAILABLE' }, 503))
      .mockResolvedValueOnce(reply({ code: 'Ok', routes: [{ distance: 3500, duration: 500, geometry: { coordinates: [[69.1, 34.5], [69.12, 34.52]] } }] }));
    await expect(findRoute(from, to)).resolves.toMatchObject({ source: 'osrm', distanceM: 3500 });
    expect(urls()[1]).toContain('router.project-osrm.org/route/v1/driving/69.1,34.5;69.12,34.52');

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('offline'));
    const straight = await findRoute(from, to);
    expect(straight.source).toBe('straight');
    expect(straight.distanceM).toBeGreaterThan(2_800);
    expect(straight.distanceM).toBeLessThan(2_900);
  });

  it('reads "NoRoute" from OSRM as no route', () => {
    expect(routeFromOsrm({ code: 'NoRoute' })).toBeNull();
    expect(routeFromOsrm({ code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] })).toBeNull();
  });

  it('measures what is left from the nearest point on the line, and scales the time with it', () => {
    // An L: 1 km east, then 1 km north (at Kabul's latitude).
    const east = 1000 / (111_320 * Math.cos((34.5 * Math.PI) / 180));
    const north = 1000 / 110_574;
    const route: Route = {
      source: 'google',
      line: [
        [69.1, 34.5],
        [69.1 + east, 34.5],
        [69.1 + east, 34.5 + north],
      ],
      distanceM: 2000,
      durationS: 300,
    };
    // Halfway along the first leg, 20 m off to the side.
    const progress = routeProgress(route, { longitude: 69.1 + east / 2, latitude: 34.5 + 20 / 110_574 }, 12);
    expect(progress.remainingM).toBeGreaterThan(1_510);
    expect(progress.remainingM).toBeLessThan(1_530);
    expect(progress.offRouteM).toBeGreaterThan(18);
    expect(progress.offRouteM).toBeLessThan(22);
    // The road's own time for what is left (3/4 of 300 s), and the 20 m to the line at the slow walking pace.
    expect(progress.etaS).toBeCloseTo(300 * (1500 / 2000) + 20 / (30 / 3.6), -1);
    expect(progress.arrived).toBe(false);

    const there = routeProgress(route, { longitude: 69.1 + east, latitude: 34.5 + north - 10 / 110_574 }, 0);
    expect(there.arrived).toBe(true);
    expect(there.remainingM).toBe(0);
  });

  it('times a straight line by the live speed once moving', () => {
    const route = straightRoute(from, to);
    const slow = routeProgress(route, from, 0);
    const fast = routeProgress(route, from, 20);
    expect(fast.etaS).toBeCloseTo(route.distanceM / 20, 0);
    expect(slow.etaS).toBeCloseTo(route.distanceM / (30 / 3.6), 0);
  });

  it('asks for a new route only when clearly off the line, not too often, and not while standing still', () => {
    const off: RouteProgress = {
      remainingM: 1000,
      etaS: 100,
      offRouteM: 90,
      snapped: [0, 0] as LngLat,
      alongM: 0,
      onRoute: false,
      arrived: false,
    };
    expect(shouldReroute(off, 10, 0, 30_000)).toBe(true);
    expect(shouldReroute(off, 10, 20_000, 30_000)).toBe(false);
    // A GPS that is 80 m unsure is not "off the route" at 90 m.
    expect(shouldReroute(off, 80, 0, 30_000)).toBe(false);
    expect(shouldReroute({ ...off, offRouteM: 30 }, 10, 0, 30_000)).toBe(false);
    // Standing still, a wandering fix must not set off a new route; once the phone has really moved, it may.
    expect(shouldReroute(off, 10, 0, 30_000, 20_000, REROUTE_MIN_MOVE_M - 10)).toBe(false);
    expect(shouldReroute(off, 10, 0, 30_000, 20_000, REROUTE_MIN_MOVE_M + 10)).toBe(true);
    // Never once arrived.
    expect(shouldReroute({ ...off, arrived: true }, 10, 0, 30_000)).toBe(false);
  });

  it('asks the GPS error for a wider tolerance, never a narrower one', () => {
    expect(toleranceFor(null)).toBe(60);
    expect(toleranceFor(5)).toBe(60);
    expect(toleranceFor(80)).toBe(120);
  });

  describe('measured along the road, forward only', () => {
    // Metres to degrees at Kabul's latitude.
    const dE = (m: number) => m / (111_320 * Math.cos((34.5 * Math.PI) / 180));
    const dN = (m: number) => m / 110_574;
    const at = (east: number, north: number) => ({
      longitude: 69.1 + dE(east),
      latitude: 34.5 + dN(north),
    });
    const pt = (east: number, north: number): LngLat => [69.1 + dE(east), 34.5 + dN(north)];
    // Out 1 km along one lane, a U-turn 100 m across, and back along the other lane: 2.1 km.
    const loop: Route = {
      source: 'osrm',
      line: [pt(0, 0), pt(1000, 0), pt(1000, 100), pt(0, 100)],
      distanceM: 2100,
      durationS: 420,
    };

    it('does not jump to the return lane that happens to be closer', () => {
      const driver = at(500, 55); // 55 m from the way out, 45 m from the way back
      const unmatched = routeProgress(loop, driver, 10);
      expect(unmatched.remainingM).toBeLessThan(700); // the old, nearest-anywhere answer: nearly home
      const matched = routeProgress(loop, driver, 10, { matchedAlongM: 500 });
      expect(matched.onRoute).toBe(true);
      expect(matched.alongM).toBeGreaterThan(480);
      expect(matched.alongM).toBeLessThan(520);
      expect(matched.remainingM).toBeGreaterThan(1_600);
      expect(matched.remainingM).toBeLessThan(1_700);
    });

    it('only moves forward on the line while the driver is on it', () => {
      const first = routeProgress(loop, at(500, 2), 10, { matchedAlongM: 480 });
      const later = routeProgress(loop, at(560, 2), 10, { matchedAlongM: first.alongM });
      expect(later.alongM).toBeGreaterThan(first.alongM);
      expect(later.remainingM).toBeLessThan(first.remainingM);
      // A fix that wanders 30 m back does not make the distance to go grow by more than that.
      const wander = routeProgress(loop, at(530, 2), 10, { matchedAlongM: later.alongM });
      expect(wander.remainingM - later.remainingM).toBeLessThan(40);
    });

    it('stays attached to the last place on the road when the driver leaves it, and says so', () => {
      const away = routeProgress(loop, at(500, 300), 10, { matchedAlongM: 500 });
      expect(away.onRoute).toBe(false);
      expect(away.alongM).toBe(500);
      expect(away.offRouteM).toBeGreaterThan(290);
      expect(away.offRouteM).toBeLessThan(310);
      // What is left still counts the way along the road plus the gap back to it.
      expect(away.remainingM).toBeGreaterThan(1_600 + 290);
    });

    it('counts the stretch from the end of the road to the listing, and arrives at the listing, not the road end', () => {
      const road: Route = {
        source: 'osrm',
        line: [pt(0, 0), pt(800, 0)],
        distanceM: 800,
        durationS: 100,
      };
      const listing = at(1000, 0); // the nearest road ends 200 m short
      const start = routeProgress(road, at(0, 0), 0, { destination: listing });
      expect(start.remainingM).toBeGreaterThan(995);
      expect(start.remainingM).toBeLessThan(1_005);
      const roadEnd = routeProgress(road, at(800, 0), 0, { destination: listing });
      expect(roadEnd.arrived).toBe(false);
      expect(roadEnd.remainingM).toBeGreaterThan(195);
      expect(roadEnd.remainingM).toBeLessThan(205);
      const there = routeProgress(road, at(990, 0), 0, { destination: listing });
      expect(there.arrived).toBe(true);
      expect(there.remainingM).toBe(0);
    });
  });

  describe('a short trip is not sent the long way round', () => {
    const near = { latitude: 34.5, longitude: 69.1 };
    // 150 m away.
    const next = { latitude: 34.5, longitude: 69.1 + 150 / (111_320 * Math.cos((34.5 * Math.PI) / 180)) };
    const osrmReply = (distance: number) =>
      reply({
        code: 'Ok',
        routes: [
          {
            distance,
            duration: distance / 8,
            geometry: { coordinates: [[near.longitude, near.latitude], [next.longitude, next.latitude]] },
          },
        ],
      });

    it('falls back to the straight line, marked as a short trip, when the road is a long detour', async () => {
      fetchMock.mockResolvedValue(osrmReply(2_000));
      const route = await findRoute(near, next);
      expect(route.source).toBe('straight');
      expect(route.near).toBe(true);
      expect(route.distanceM).toBeGreaterThan(140);
      expect(route.distanceM).toBeLessThan(160);
    });

    it('keeps a sensible road for the same short trip', async () => {
      fetchMock.mockResolvedValue(osrmReply(210));
      const route = await findRoute(near, next);
      expect(route.source).toBe('osrm');
      expect(route.near).toBeUndefined();
    });

    it('never calls a longer trip a detour, whatever the road does', () => {
      const far = { latitude: 34.52, longitude: 69.12 };
      const winding: Route = {
        source: 'osrm',
        line: [[near.longitude, near.latitude], [far.longitude, far.latitude]],
        distanceM: 9_000,
        durationS: 900,
      };
      expect(isDetour(winding, near, far)).toBe(false);
      expect(NEAR_TRIP_M).toBeLessThan(500);
      expect(DETOUR_FACTOR).toBeGreaterThan(1);
    });
  });
});

describe('metres between two points', () => {
  it('measures a degree of latitude and shrinks a degree of longitude with the latitude', () => {
    expect(metresBetween([69, 34], [69, 34.001])).toBeGreaterThan(110);
    expect(metresBetween([69, 34], [69, 34.001])).toBeLessThan(112);
    expect(metresBetween([69, 34], [69.001, 34])).toBeLessThan(metresBetween([69, 0], [69.001, 0]));
    expect(metresBetween([69, 34], [69, 34])).toBe(0);
  });
});

describe('live speed', () => {
  const at = (latitude: number, longitude: number, timestamp: number, speed: number | null = null, accuracy = 5) => ({
    coords: { latitude, longitude, speed, accuracy, heading: null },
    timestamp,
  });

  it("uses the phone's own speed, smoothed", () => {
    const first = nextFix(null, at(34.5, 69.1, 0, 12.5));
    expect(first.speed).toBe(12.5);
    const second = nextFix(first, at(34.5001, 69.1, 1000, 10));
    expect(second.speed).toBeCloseTo(12.5 * 0.35 + 10 * 0.65, 6);
  });

  it('works the speed out from distance over time when the phone gives none', () => {
    const first = nextFix(null, at(34.5, 69.1, 0));
    expect(first.speed).toBeNull();
    // About 111 m north in 10 s: 11.1 m/s, 40 km/h.
    const second = nextFix(first, at(34.501, 69.1, 10_000));
    expect(second.speed).toBeGreaterThan(11);
    expect(second.speed).toBeLessThan(11.2);
  });

  it('shows 0 for GPS wander, and ignores an unsure fix', () => {
    const still = nextFix(null, at(34.5, 69.1, 0, 0.3));
    expect(still.speed).toBe(0);
    expect(STANDSTILL_MPS).toBeGreaterThan(0.3);
    const prev: LiveFix = nextFix(null, at(34.5, 69.1, 0, null, 100));
    expect(nextFix(prev, at(34.501, 69.1, 5000, null, 100)).speed).toBeNull();
  });
});

describe('the HUD in Dari', () => {
  beforeAll(() => initI18n());
  const t = i18next.t.bind(i18next);

  it('says distances in metres, then kilometres', () => {
    expect(formatDistance(4200, t)).toBe('۴٫۲ کیلومتر');
    expect(formatDistance(812, t)).toBe('۸۱۰ متر');
    expect(formatDistance(42, t)).toBe('۴۰ متر');
    expect(formatDistance(998, t)).toBe('۱ کیلومتر');
    expect(formatDistance(152_400, t)).toBe('۱۵۲ کیلومتر');
  });

  it('says the time in minutes, then hours', () => {
    expect(formatEta(30, t)).toBe('کمتر از ۱ دقیقه');
    expect(formatEta(452, t)).toBe('۸ دقیقه');
    expect(formatEta(3600, t)).toBe('۱ ساعت');
    expect(formatEta(4500, t)).toBe('۱ ساعت و ۱۵ دقیقه');
  });

  it('says the speed in km/h', () => {
    expect(formatSpeed(12.5, t)).toBe('۴۵ km/h');
    expect(formatSpeed(null, t)).toBe('–');
  });
});
