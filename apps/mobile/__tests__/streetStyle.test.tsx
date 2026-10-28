import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { MAP_STYLE_API_URL, SATELLITE_STYLE_API_URL } from '../src/config';
import { jsonResponse, render } from '../test-utils';

// jest.setup.js replaces the hook with a stand-in so screens never download anything; these tests use the real module.
const streetStyle = jest.requireActual('../src/map/streetStyle') as typeof import('../src/map/streetStyle');
const {
  localizeLabel,
  localizeStyle,
  fetchStreetStyle,
  fetchSatelliteStyle,
  loadStreetStyle,
  loadSatelliteStyle,
  useStreetStyle,
  useSatelliteStyle,
  resetStreetStyleForTests,
} = streetStyle;

const LOCAL_FIRST = ['coalesce', ['get', 'name'], ['get', 'name_en']];

// A cut-down Mapbox Streets: the shapes the real style uses for its labels.
const streets = () => ({
  version: 8,
  name: 'Mapbox Streets',
  sprite: 'mapbox://sprites/mapbox/streets-v12',
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  sources: { composite: { url: 'mapbox://mapbox.mapbox-streets-v8', type: 'vector' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'road-label', type: 'symbol', source: 'composite', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-size': 12 } },
    { id: 'settlement-label', type: 'symbol', source: 'composite', layout: { 'text-field': ['to-string', ['get', 'name_en']] } },
    { id: 'old-label', type: 'symbol', source: 'composite', layout: { 'text-field': '{name_en}' } },
    { id: 'shield', type: 'symbol', source: 'composite', layout: { 'text-field': ['get', 'ref'] } },
    { id: 'icon-only', type: 'symbol', source: 'composite', layout: { 'icon-image': 'dot' } },
    { id: 'water', type: 'fill', source: 'composite', paint: { 'fill-color': '#9cc' } },
  ],
});

describe('local-language labels', () => {
  it('puts the local name before the English one wherever a label asks for the English one', () => {
    expect(localizeLabel(['get', 'name_en'])).toEqual(LOCAL_FIRST);
    expect(localizeLabel('{name_en}')).toEqual(LOCAL_FIRST);
    expect(localizeLabel(' {name_en} ')).toEqual(LOCAL_FIRST);
    expect(localizeLabel(['coalesce', ['get', 'name_en'], ['get', 'name']])).toEqual([
      'coalesce',
      LOCAL_FIRST,
      ['get', 'name'],
    ]);
    expect(localizeLabel(['format', ['get', 'name_en'], { 'font-scale': 0.8 }, '\n', {}, ['get', 'ref']])).toEqual([
      'format',
      LOCAL_FIRST,
      { 'font-scale': 0.8 },
      '\n',
      {},
      ['get', 'ref'],
    ]);
  });

  it('leaves every other label alone', () => {
    for (const value of [['get', 'name'], ['get', 'ref'], '{ref}', 'plain text', 12, null, undefined, ['to-string', ['get', 'house_num']]]) {
      expect(localizeLabel(value)).toEqual(value);
    }
  });

  it('rewrites only the symbol layers that have an English label, and never changes the style it was given', () => {
    const original = streets();
    const snapshot = JSON.stringify(original);
    const { style, changed } = localizeStyle(original as never);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(changed).toBe(3);
    const field = (id: string) => style.layers.find(layer => layer.id === id)?.layout?.['text-field'];
    expect(field('road-label')).toEqual(['coalesce', LOCAL_FIRST, ['get', 'name']]);
    expect(field('settlement-label')).toEqual(['to-string', LOCAL_FIRST]);
    expect(field('old-label')).toEqual(LOCAL_FIRST);
    expect(field('shield')).toEqual(['get', 'ref']);
    expect(style.layers.find(layer => layer.id === 'road-label')?.layout?.['text-size']).toBe(12);
    // Everything that is not a label comes through untouched, sprite and fonts included.
    expect(style.sprite).toBe('mapbox://sprites/mapbox/streets-v12');
    expect(style.glyphs).toBe('mapbox://fonts/mapbox/{fontstack}/{range}.pbf');
    expect(style.layers.find(layer => layer.id === 'water')).toEqual(original.layers[6]);
  });

  it('says 0 changes for a style with nothing to adjust', () => {
    expect(localizeStyle({ version: 8, sources: {}, layers: [] }).changed).toBe(0);
  });
});

describe('downloading the street style', () => {
  const ok = (body: unknown) => jest.fn(async () => ({ ...jsonResponse(200, body), json: async () => body }) as never);

  it('asks Mapbox\'s styles service with the token and returns the style with local names first', async () => {
    const fetcher = ok(streets());
    const style = await fetchStreetStyle(fetcher as never, 'pk.a b');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe(`${MAP_STYLE_API_URL}?access_token=pk.a%20b`);
    expect(style?.layers.find(layer => layer.id === 'road-label')?.layout?.['text-field']).toEqual([
      'coalesce',
      LOCAL_FIRST,
      ['get', 'name'],
    ]);
  });

  it('also shows building footprints and street names from earlier zooms, and the 3D blocks', async () => {
    const body = {
      version: 8,
      sources: { composite: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' } },
      layers: [
        { id: 'building', type: 'fill', source: 'composite', 'source-layer': 'building', minzoom: 15 },
        {
          id: 'road-label',
          type: 'symbol',
          source: 'composite',
          'source-layer': 'road',
          minzoom: 15,
          layout: { 'text-field': ['get', 'name'] },
        },
      ],
    };
    const style = await fetchStreetStyle(ok(body) as never, 'pk.a');
    expect(style?.layers.find(layer => layer.id === 'building')?.minzoom).toBe(13);
    expect(style?.layers.find(layer => layer.id === 'road-label')?.minzoom).toBe(13);
    // 3D blocks come with the style: they show once the 3D button tilts the map.
    expect(style?.layers.some(layer => layer.type === 'fill-extrusion' && layer.id === 'bongah-buildings-3d')).toBe(true);
  });

  it('gives nothing, without asking, when there is no token', async () => {
    const fetcher = ok(streets());
    expect(await fetchStreetStyle(fetcher as never, '')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('gives nothing, never an error, when the service refuses, answers rubbish or cannot be reached', async () => {
    expect(await fetchStreetStyle((async () => ({ ok: false, status: 401, json: async () => ({}) })) as never, 'pk.x')).toBeNull();
    expect(await fetchStreetStyle(ok({ message: 'hello' }) as never, 'pk.x')).toBeNull();
    expect(await fetchStreetStyle(ok({ version: 7, layers: [], sources: {} }) as never, 'pk.x')).toBeNull();
    expect(await fetchStreetStyle((async () => { throw new Error('offline'); }) as never, 'pk.x')).toBeNull();
    expect(await fetchStreetStyle((async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } })) as never, 'pk.x')).toBeNull();
  });
});

describe('sharing one download between maps', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => resetStreetStyleForTests());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const answer = (body: unknown) =>
    (globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => body })) as never);

  it('downloads once however many maps ask, and remembers the answer', async () => {
    const fetcher = answer(streets());
    const [a, b] = await Promise.all([loadStreetStyle(), loadStreetStyle()]);
    expect(a).toBe(b);
    expect(await loadStreetStyle()).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failure: the next map tries again', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as never;
    expect(await loadStreetStyle()).toBeNull();
    const fetcher = answer(streets());
    expect(await loadStreetStyle()).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('useStreetStyle', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => resetStreetStyleForTests());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function Probe({ enabled = true }: { enabled?: boolean }) {
    const state = useStreetStyle(enabled);
    return <Text testID="state">{state.status}</Text>;
  }
  const status = (tree: ReactTestRenderer.ReactTestRenderer) => tree.root.findByProps({ testID: 'state' }).props.children;

  it('is loading while the download is on its way, then ready', async () => {
    let release!: () => void;
    globalThis.fetch = jest.fn(
      () =>
        new Promise(resolve => {
          release = () => resolve({ ok: true, status: 200, json: async () => streets() });
        }),
    ) as never;
    const tree = await render(<Probe />);
    expect(status(tree)).toBe('loading');
    await ReactTestRenderer.act(async () => {
      release();
    });
    expect(status(tree)).toBe('ready');
  });

  it('is ready at once when an earlier map already downloaded it', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => streets() })) as never;
    await loadStreetStyle();
    const tree = await render(<Probe />);
    expect(status(tree)).toBe('ready');
  });

  it('is unavailable when the download fails', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as never;
    const tree = await render(<Probe />);
    expect(status(tree)).toBe('unavailable');
  });

  it('downloads nothing for a map that does not need it (the satellite view)', async () => {
    globalThis.fetch = jest.fn() as never;
    await render(<Probe enabled={false} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// A cut-down Mapbox Satellite Streets: the aerial photographs, then the vector street layer drawn over them.
const satelliteStreets = () => ({
  version: 8,
  name: 'Mapbox Satellite Streets',
  sprite: 'mapbox://sprites/mapbox/satellite-streets-v12',
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  sources: {
    composite: { url: 'mapbox://mapbox.mapbox-streets-v8', type: 'vector' },
    'mapbox://mapbox.satellite': { url: 'mapbox://mapbox.satellite', type: 'raster', tileSize: 256 },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'mapbox://mapbox.satellite' },
    { id: 'road-street', type: 'line', source: 'composite', 'source-layer': 'road', minzoom: 12 },
    { id: 'building', type: 'fill', source: 'composite', 'source-layer': 'building', minzoom: 15 },
    { id: 'road-label', type: 'symbol', source: 'composite', 'source-layer': 'road', minzoom: 15, layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } },
  ],
});

describe('downloading the satellite style', () => {
  const ok = (body: unknown) => jest.fn(async () => ({ ...jsonResponse(200, body), json: async () => body }) as never);

  it('asks the satellite-streets style, with the token, and puts local names first', async () => {
    const fetcher = ok(satelliteStreets());
    const style = await fetchSatelliteStyle(fetcher as never, 'pk.a b');
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe(`${SATELLITE_STYLE_API_URL}?access_token=pk.a%20b`);
    expect(style?.layers.find(layer => layer.id === 'road-label')?.layout?.['text-field']).toEqual([
      'coalesce',
      LOCAL_FIRST,
      ['get', 'name'],
    ]);
  });

  it('keeps the photographs, the roads and the outlines exactly as Mapbox draws them (no extra layers, no moved zoom levels)', async () => {
    const body = satelliteStreets();
    const style = await fetchSatelliteStyle(ok(body) as never, 'pk.a');
    expect(style?.layers.map(layer => layer.id)).toEqual(body.layers.map(layer => layer.id));
    expect(style?.layers.find(layer => layer.id === 'satellite')).toEqual(body.layers[0]);
    expect(style?.layers.find(layer => layer.id === 'road-street')?.minzoom).toBe(12);
    expect(style?.layers.find(layer => layer.id === 'building')?.minzoom).toBe(15);
    expect(style?.sources).toEqual(body.sources);
  });

  it('gives nothing, without asking, when there is no token, and nothing at all when the service refuses', async () => {
    const fetcher = ok(satelliteStreets());
    expect(await fetchSatelliteStyle(fetcher as never, '')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await fetchSatelliteStyle((async () => ({ ok: false, status: 401, json: async () => ({}) })) as never, 'pk.x')).toBeNull();
    expect(await fetchSatelliteStyle(ok({ version: 7, layers: [], sources: {} }) as never, 'pk.x')).toBeNull();
  });
});

describe('sharing the satellite download, apart from the street one', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => resetStreetStyleForTests());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('downloads each style once, and never answers one with the other', async () => {
    const fetcher = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('satellite-streets') ? satelliteStreets() : streets()),
    }));
    globalThis.fetch = fetcher as never;
    const [sat, sat2, street] = await Promise.all([loadSatelliteStyle(), loadSatelliteStyle(), loadStreetStyle()]);
    expect(sat).toBe(sat2);
    expect(sat).not.toBe(street);
    expect(sat?.name).toBe('Mapbox Satellite Streets');
    expect(street?.name).toBe('Mapbox Streets');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('useSatelliteStyle', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => resetStreetStyleForTests());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function Probe({ enabled = true }: { enabled?: boolean }) {
    const state = useSatelliteStyle(enabled);
    return <Text testID="state">{state.status}</Text>;
  }
  const status = (tree: ReactTestRenderer.ReactTestRenderer) => tree.root.findByProps({ testID: 'state' }).props.children;

  it('is ready once the satellite style has been downloaded', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => satelliteStreets() })) as never;
    const tree = await render(<Probe />);
    expect(status(tree)).toBe('ready');
  });

  it('is unavailable when the download fails, and downloads nothing for a map that is not in the satellite view', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as never;
    const tree = await render(<Probe />);
    expect(status(tree)).toBe('unavailable');
    (globalThis.fetch as jest.Mock).mockClear();
    await render(<Probe enabled={false} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
