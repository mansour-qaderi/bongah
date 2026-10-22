import { ServiceUnavailableException } from '@nestjs/common';
import type { PlaceDetails } from '@bongah/shared-types';
import { decodePolyline, GeoBackendError, pickRoute, type GeoBackend } from './geo.backend.js';
import { readGeoSettings } from './geo.config.js';
import { GeoService } from './geo.service.js';
import { GoogleGeoBackend } from './google.backend.js';
import { MapboxGeoBackend } from './mapbox.backend.js';

const config = (values: Record<string, string>) => ({ get: <T>(name: string) => values[name] as T | undefined });
const reply = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });

describe('readGeoSettings', () => {
  it('asks nobody without keys', () => {
    expect(readGeoSettings(config({})).providers).toEqual([]);
  });

  it('asks Google first when both keys are set', () => {
    const settings = readGeoSettings(config({ GOOGLE_MAPS_API_KEY: 'g', MAPBOX_ACCESS_TOKEN: 'm' }));
    expect(settings.providers).toEqual(['google', 'mapbox']);
    expect(settings.timeoutMs).toBe(6000);
  });

  it('follows GEO_PROVIDERS, and refuses a provider without its key or an unknown one', () => {
    expect(readGeoSettings(config({ GOOGLE_MAPS_API_KEY: 'g', MAPBOX_ACCESS_TOKEN: 'm', GEO_PROVIDERS: 'mapbox, google' })).providers).toEqual([
      'mapbox',
      'google',
    ]);
    expect(() => readGeoSettings(config({ GEO_PROVIDERS: 'google' }))).toThrow(/GOOGLE_MAPS_API_KEY/);
    expect(() => readGeoSettings(config({ GOOGLE_MAPS_API_KEY: 'g', GEO_PROVIDERS: 'here' }))).toThrow(/"here"/);
    expect(() => readGeoSettings(config({ GEO_TIMEOUT_MS: '10' }))).toThrow(/GEO_TIMEOUT_MS/);
  });
});

describe('decodePolyline', () => {
  it("decodes Google's documented example into [lng, lat] pairs", () => {
    // developers.google.com/maps/documentation/utilities/polylinealgorithm
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });
});

describe('GoogleGeoBackend', () => {
  afterEach(() => vi.unstubAllGlobals());
  const google = new GoogleGeoBackend('google-key', 3000);

  it('asks Places (New) autocomplete inside Afghanistan, near the person, and reads the rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJcafe',
              text: { text: 'کافه براسان، زرنج' },
              structuredFormat: { mainText: { text: 'کافه براسان' }, secondaryText: { text: 'زرنج، نیمروز' } },
              types: ['cafe', 'food', 'point_of_interest', 'establishment'],
            },
          },
          { queryPrediction: { text: { text: 'کافه' } } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await google.autocomplete({
      query: 'کافه براسان',
      near: { lat: 30.96, lng: 61.86 },
      session: 'session-1234',
      language: 'fa',
    });

    expect(rows).toEqual([
      { id: 'ChIJcafe', provider: 'google', title: 'کافه براسان', subtitle: 'زرنج، نیمروز', category: 'cafe', lat: null, lng: null },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'google-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'کافه براسان',
      languageCode: 'fa',
      includedRegionCodes: ['af'],
      sessionToken: 'session-1234',
      locationBias: { circle: { center: { latitude: 30.96, longitude: 61.86 }, radius: 50_000 } },
    });
  });

  it('reads a chosen place with its province, and treats an unknown id as nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          reply(200, {
            displayName: { text: 'شفاخانه جمهوریت' },
            formattedAddress: 'جاده آسمایی، کابل، افغانستان',
            location: { latitude: 34.52, longitude: 69.17 },
            addressComponents: [
              { longText: 'کابل', types: ['administrative_area_level_1', 'political'] },
              { longText: 'جاده آسمایی', types: ['route'] },
            ],
          }),
        )
        .mockResolvedValueOnce(reply(404, { error: { status: 'NOT_FOUND' } })),
    );
    await expect(google.place('ChIJhosp', 's', 'fa')).resolves.toEqual({
      provider: 'google',
      title: 'شفاخانه جمهوریت',
      address: 'جاده آسمایی، کابل، افغانستان',
      lat: 34.52,
      lng: 69.17,
      province: 'کابل',
      district: null,
      neighborhood: null,
      street: 'جاده آسمایی',
    });
    await expect(google.place('ChIJgone', 's', 'fa')).resolves.toBeNull();
  });

  it('reads a route and its "1234s" duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(200, { routes: [{ distanceMeters: 4200, duration: '480s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }),
      ),
    );
    await expect(google.route({ lat: 34.5, lng: 69.1 }, { lat: 34.6, lng: 69.2 })).resolves.toEqual({
      provider: 'google',
      distance_m: 4200,
      duration_s: 480,
      coordinates: [
        [-120.2, 38.5],
        [-120.95, 40.7],
      ],
    });
  });

  it('asks for the alternatives too and takes the fastest of them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        routes: [
          { distanceMeters: 9000, duration: '900s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } },
          { distanceMeters: 3000, duration: '300s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } },
          { distanceMeters: 4000, duration: '500s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const found = await google.route({ lat: 34.5, lng: 69.1 }, { lat: 34.6, lng: 69.2 });
    expect(found?.duration_s).toBe(300);
    expect(found?.distance_m).toBe(3000);
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(sent.computeAlternativeRoutes).toBe(true);
    expect(sent.travelMode).toBe('DRIVE');
    expect(sent.regionCode).toBe('AF');
  });

  it('says "nothing" for ZERO_RESULTS and fails loudly for a refused key', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(200, { status: 'ZERO_RESULTS', results: [] }))
        .mockResolvedValueOnce(reply(200, { status: 'REQUEST_DENIED' })),
    );
    await expect(google.reverse({ lat: 31, lng: 62 }, 'fa')).resolves.toBeNull();
    await expect(google.reverse({ lat: 31, lng: 62 }, 'fa')).rejects.toBeInstanceOf(GeoBackendError);
  });
});

describe('MapboxGeoBackend', () => {
  afterEach(() => vi.unstubAllGlobals());
  const mapbox = new MapboxGeoBackend('mapbox-token', 3000);

  it('suggests from Search Box inside Afghanistan, near the person', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        suggestions: [
          { mapbox_id: 'dXJuOm1ieHBvaTox', name: 'Kabul University', place_formatted: 'Kabul, Afghanistan', poi_category_ids: ['university'] },
          { mapbox_id: '', name: 'broken' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await mapbox.autocomplete({ query: 'university', near: { lat: 34.5, lng: 69.1 }, session: 'sess-5678', language: 'fa' });
    expect(rows).toEqual([
      { id: 'dXJuOm1ieHBvaTox', provider: 'mapbox', title: 'Kabul University', subtitle: 'Kabul, Afghanistan', category: 'university', lat: null, lng: null },
    ]);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/search/searchbox/v1/suggest');
    expect(url.searchParams.get('country')).toBe('af');
    expect(url.searchParams.get('proximity')).toBe('69.1,34.5');
    expect(url.searchParams.get('session_token')).toBe('sess-5678');
  });

  it('reads a route, and "NoRoute" as nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          reply(200, {
            code: 'Ok',
            routes: [{ distance: 900, duration: 120, geometry: { coordinates: [[69.1, 34.5], [69.11, 34.51], ['x', 1]] } }],
          }),
        )
        .mockResolvedValueOnce(reply(200, { code: 'NoRoute', routes: [] })),
    );
    await expect(mapbox.route({ lat: 34.5, lng: 69.1 }, { lat: 34.51, lng: 69.11 })).resolves.toEqual({
      provider: 'mapbox',
      distance_m: 900,
      duration_s: 120,
      coordinates: [
        [69.1, 34.5],
        [69.11, 34.51],
      ],
    });
    await expect(mapbox.route({ lat: 34.5, lng: 69.1 }, { lat: 31, lng: 62 })).resolves.toBeNull();
  });

  it('asks for the alternatives and takes the fastest, the shorter one when two are as fast', async () => {
    const line = { coordinates: [[69.1, 34.5], [69.11, 34.51]] };
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        code: 'Ok',
        routes: [
          { distance: 5000, duration: 400, geometry: line },
          { distance: 2000, duration: 210, geometry: line },
          { distance: 2600, duration: 200, geometry: line },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const found = await mapbox.route({ lat: 34.5, lng: 69.1 }, { lat: 34.51, lng: 69.11 });
    // 210 s is within 10 % of 200 s and 600 m shorter.
    expect(found?.distance_m).toBe(2000);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain('/directions/v5/mapbox/driving/');
    expect(url.searchParams.get('alternatives')).toBe('true');
  });
});

describe('pickRoute', () => {
  it('is nothing for no routes, the only one for one, and prefers the quicker', () => {
    expect(pickRoute([])).toBeNull();
    const only = { distance_m: 10, duration_s: 10 };
    expect(pickRoute([only])).toBe(only);
    expect(pickRoute([{ distance_m: 1000, duration_s: 600 }, { distance_m: 3000, duration_s: 300 }])).toEqual({
      distance_m: 3000,
      duration_s: 300,
    });
  });

  it('takes the more direct of two routes that are about as fast, but not a much slower one', () => {
    expect(pickRoute([{ distance_m: 3000, duration_s: 300 }, { distance_m: 2500, duration_s: 320 }])).toEqual({
      distance_m: 2500,
      duration_s: 320,
    });
    expect(pickRoute([{ distance_m: 3000, duration_s: 300 }, { distance_m: 1500, duration_s: 400 }])).toEqual({
      distance_m: 3000,
      duration_s: 300,
    });
  });
});

describe('GeoService', () => {
  const place: PlaceDetails = {
    provider: 'mapbox',
    title: 'x',
    address: 'x',
    lat: 31,
    lng: 62,
    province: null,
    district: null,
    neighborhood: null,
    street: null,
  };
  const backend = (name: 'google' | 'mapbox', impl: Partial<GeoBackend>): GeoBackend => ({
    name,
    autocomplete: vi.fn().mockResolvedValue([]),
    place: vi.fn().mockResolvedValue(null),
    reverse: vi.fn().mockResolvedValue(null),
    route: vi.fn().mockResolvedValue(null),
    ...impl,
  });

  it('is unavailable (503 GEO_UNAVAILABLE) with no provider', async () => {
    const error = await new GeoService([]).autocomplete({ query: 'کابل', language: 'fa' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'GEO_UNAVAILABLE' });
  });

  it('asks the next provider when the first is down or knows nothing', async () => {
    const down = backend('google', { reverse: vi.fn().mockRejectedValue(new GeoBackendError('google', 'answered HTTP 429', 429)) });
    const knows = backend('mapbox', { reverse: vi.fn().mockResolvedValue(place) });
    await expect(new GeoService([down, knows]).reverse({ lat: 31, lng: 62 }, 'fa')).resolves.toBe(place);

    const empty = backend('google', {});
    const suggests = backend('mapbox', {
      autocomplete: vi.fn().mockResolvedValue([{ id: 'a', provider: 'mapbox', title: 't', subtitle: '', category: null, lat: null, lng: null }]),
    });
    await expect(new GeoService([empty, suggests]).autocomplete({ query: 'کافه', language: 'fa' })).resolves.toHaveLength(1);
  });

  it('answers "nothing" when every provider answered empty, and 503 when none answered', async () => {
    await expect(new GeoService([backend('google', {}), backend('mapbox', {})]).route({ lat: 31, lng: 62 }, { lat: 31.1, lng: 62.1 })).resolves.toBeNull();
    const down = backend('google', { route: vi.fn().mockRejectedValue(new GeoBackendError('google', 'could not be reached')) });
    await expect(new GeoService([down]).route({ lat: 31, lng: 62 }, { lat: 31.1, lng: 62.1 })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reads a chosen place only from the provider that made its id", async () => {
    const google = backend('google', { place: vi.fn().mockResolvedValue({ ...place, provider: 'google' }) });
    const mapbox = backend('mapbox', { place: vi.fn().mockResolvedValue(place) });
    await expect(new GeoService([google, mapbox]).place('mapbox', 'id', undefined, 'fa')).resolves.toBe(place);
    expect(google.place).not.toHaveBeenCalled();
  });

  it('does not hide a programming error as "unavailable"', async () => {
    const broken = backend('google', { reverse: vi.fn().mockRejectedValue(new TypeError('bug')) });
    await expect(new GeoService([broken]).reverse({ lat: 31, lng: 62 }, 'fa')).rejects.toBeInstanceOf(TypeError);
  });
});
