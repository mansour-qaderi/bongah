import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { dealColors } from '../src/theme';
import { setAuthToken } from '../src/api/client';
import {
  allText,
  callsTo,
  inputLabelled,
  jsonResponse,
  mapParts,
  chooseType,
  render as renderTree,
  tapMap,
} from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: { status: string; user: unknown } = {
  status: 'signedIn',
  user: null,
};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () =>
  require('../test-utils/navMock').navigationModule(),
);
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import AddPropertyScreen, {
  LOOKUP_DELAY_MS,
  MY_POSITION_ZOOM,
} from '../src/screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import { SUGGEST_DELAY_MS } from '../src/components/PlaceSearchField';

const maplibre = () =>
  jest.requireMock('@maplibre/maplibre-react-native') as {
    __flyTo: jest.Mock;
    __location: { grant: boolean; position: unknown; requests: number };
    __emitLocation: (position: unknown) => void;
    __locationListeners: Set<unknown>;
  };

const user = { id: 'u1', role: 'USER', phone_number: '+93701234567', full_name: null, avatar: null };
const ID = '11111111-1111-4111-8111-111111111111';
const listing = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: 'someone-else',
  agency_id: null,
  agency_name: null,
  title: 'زمین در زرنج',
  description: 'زمین هموار',
  type: 'LAND',
  deal_type: 'SALE',
  price: 1000,
  currency: 'AFGHANI',
  area_sqm: 2000,
  bedrooms: null,
  bathrooms: null,
  province: 'نیمروز',
  district: 'زرنج',
  neighborhood: null,
  address: 'ناحیه ۵',
  lat: null,
  lng: null,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

const navigation = () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => undefined),
});
const screen = <P extends object>(Screen: React.ComponentType<P>, route: object = {}) => {
  const props = { navigation: navigation(), route: { params: undefined, ...route } } as unknown as P;
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Screen {...props} />
    </QueryClientProvider>
  );
};

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = async (rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const wait = (ms: number) =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });
const byTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const pressId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  act(async () => {
    const node = byTestId(root, id);
    if (!node) throw new Error(`nothing pressable with testID ${id}`);
    node.props.onPress();
  });
const typeInto = (root: ReactTestRenderer.ReactTestInstance, label: string, text: string, focus = false) =>
  act(async () => {
    const input = inputLabelled(root, label);
    if (focus) input.props.onFocus?.();
    input.props.onChangeText(text);
  });

/**
 * Answers the API by "METHOD /path" and the outside services (Nominatim, Photon, OSRM) by host. The outside
 * services read `json()`, which the API mock's reply does not have.
 */
type Handler = (url: URL, init: RequestInit) => unknown;
function answer(api: Record<string, Handler>, outside: Record<string, Handler> = {}) {
  fetchMock.mockImplementation(async (raw: string, init: RequestInit = {}) => {
    const url = new URL(raw);
    const host = Object.keys(outside).find(name => url.host.includes(name));
    if (host) {
      const body = outside[host](url, init);
      if (body === 'down') throw new Error('offline');
      return { ok: true, status: 200, json: async () => body };
    }
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const handler = api[key];
    if (!handler) return jsonResponse(404, { message: `no route for ${key}` });
    const reply = handler(url, init) as { status?: number; body?: unknown };
    return jsonResponse(reply.status ?? 200, reply.body);
  });
}

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user };
  setAuthToken('token');
  const m = maplibre();
  m.__flyTo.mockClear();
  m.__location.grant = true;
  m.__location.position = undefined;
  m.__location.requests = 0;
});
afterEach(async () => {
  setAuthToken(null);
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

const ZARANJ = { latitude: 30.96, longitude: 61.86 };
const fixAt = ({ latitude, longitude }: { latitude: number; longitude: number }, extra: object = {}) => ({
  coords: { latitude, longitude, accuracy: 5, speed: null, heading: null, altitude: null, altitudeAccuracy: null, ...extra },
  timestamp: Date.now(),
});
/** A square about `side` metres wide with its south-west corner at Zaranj. */
const corners = (side: number): [number, number][] => {
  const dLat = side / 110_900;
  const dLng = side / (111_320 * Math.cos((ZARANJ.latitude * Math.PI) / 180));
  const { longitude: x, latitude: y } = ZARANJ;
  return [
    [x, y],
    [x + dLng, y],
    [x + dLng, y + dLat],
    [x, y + dLat],
  ];
};

describe('the listing form opens on the phone', () => {
  it('asks for location as it opens and flies to where the phone is', async () => {
    maplibre().__location.position = fixAt(ZARANJ);
    answer({});
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    expect(maplibre().__location.requests).toBe(1);
    expect(maplibre().__flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [61.86, 30.96], zoom: MY_POSITION_ZOOM }),
    );
    // The blue dot, not the property's pin: the pin is the person's to place.
    expect(tree.root.findAll(n => n.props.testID === 'my-position').length).toBeGreaterThan(0);
    expect(allText(tree.root)).toContain(prs.add.locationHint);
  });

  it('fills the province and the address in from the phone\'s position on first open, and places no pin', async () => {
    maplibre().__location.position = fixAt(ZARANJ);
    answer({
      'GET /geo/reverse': () => ({
        body: { provider: 'google', title: 'x', address: 'x', lat: 30.96, lng: 61.86, province: 'نیمروز', district: 'زرنج', neighborhood: 'ناحیه ۵', street: '' },
      }),
    });
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    const asked = callsTo(fetchMock).filter(c => c.path === '/geo/reverse');
    expect(asked).toHaveLength(1);
    expect(asked[0].query).toMatchObject({ lat: '30.96', lng: '61.86' });
    // The address line starts with the province, and the province is known, so its own "change" row stays away.
    expect(inputLabelled(tree.root, prs.add.place).props.value).toBe('نیمروز، زرنج، ناحیه ۵');
    expect(allText(tree.root)).not.toContain(prs.add.provinceUnknown);
    // Only the person places the pin: the map is still waiting for one.
    expect(allText(tree.root)).toContain(prs.add.locationHint);
    expect(mapParts(tree.root, 'ViewAnnotation').filter(n => n.props.id === 'chosen')).toHaveLength(0);
  });

  it('does not fill anything in when the phone is outside the country or refuses', async () => {
    maplibre().__location.grant = false;
    answer({});
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    expect(callsTo(fetchMock).filter(c => c.path === '/geo/reverse')).toHaveLength(0);
    expect(inputLabelled(tree.root, prs.add.place).props.value).toBe('');
  });

  it('keeps working, quietly, when location is refused', async () => {
    maplibre().__location.grant = false;
    answer({});
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    expect(maplibre().__flyTo).not.toHaveBeenCalled();
    // No explanation card for the automatic look; only the "my location" button explains.
    expect(allText(tree.root)).not.toContain(prs.home.permissionLater);
    await pressId(tree.root, 'location-editor-locate');
    await settle();
    expect(allText(tree.root)).toContain(prs.home.permissionLater);
  });
});

describe('one place field with suggestions', () => {
  const suggestions = {
    'GET /geo/autocomplete': () => ({
      body: {
        data: [
          { id: 'g-cafe', provider: 'google', title: 'کافه براسان', subtitle: 'زرنج، نیمروز', category: 'cafe', lat: null, lng: null },
          { id: 'g-hosp', provider: 'google', title: 'شفاخانه ولایتی نیمروز', subtitle: 'زرنج', category: 'hospital', lat: null, lng: null },
        ],
      },
    }),
    'GET /geo/places/google/g-cafe': () => ({
      body: { provider: 'google', title: 'کافه براسان', address: 'زرنج، نیمروز', lat: 30.9612, lng: 61.8634, province: 'Nimroz', district: 'زرنج', neighborhood: null, street: null },
    }),
  };

  it('replaces the province box and the address box with one field', async () => {
    answer({});
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    expect(inputLabelled(tree.root, prs.add.place).props.placeholder).toBe(prs.add.placePlaceholder);
    expect(() => inputLabelled(tree.root, prs.add.address)).toThrow();
    expect(allText(tree.root)).toContain(prs.add.provinceUnknown);
  });

  it('suggests Afghan places as the person types, and a pick flies the map there and sets the province', async () => {
    answer(suggestions);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await typeInto(tree.root, prs.add.place, 'کافه برا', true);
    expect(callsTo(fetchMock).filter(c => c.path === '/geo/autocomplete')).toHaveLength(0); // waits for a pause
    await wait(SUGGEST_DELAY_MS + 50);
    await settle();

    const search = callsTo(fetchMock).find(c => c.path === '/geo/autocomplete')!;
    expect(search.query).toMatchObject({ q: 'کافه برا', lang: 'prs' });
    expect(allText(tree.root)).toContain('کافه براسان');
    expect(allText(tree.root)).toContain('شفاخانه ولایتی نیمروز');

    maplibre().__flyTo.mockClear();
    await pressId(tree.root, 'place-search-option-0');
    await settle();

    const details = callsTo(fetchMock).find(c => c.path === '/geo/places/google/g-cafe')!;
    // The pick and the search are one billing session.
    expect(details.query.session).toBe(search.query.session);
    expect(maplibre().__flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [61.8634, 30.9612], zoom: 17 }));
    expect(inputLabelled(tree.root, prs.add.place).props.value).toBe('کافه براسان، زرنج، نیمروز');
    const text = allText(tree.root);
    // The province is certain (the pick said so) and is in the address line, so its own row stays out of the way.
    expect(text).not.toContain('ولایت: نیمروز');
    expect(text).toContain(prs.add.placeChosen.replace('{{name}}', 'کافه براسان'));
    // A pick moves the map, never the pin.
    expect(text).toContain(prs.add.locationHint);
  });

  it('falls back to OpenStreetMap suggestions when the server has no key', async () => {
    answer(
      { 'GET /geo/autocomplete': () => ({ status: 503, body: { code: 'GEO_UNAVAILABLE' } }) },
      {
        'photon.komoot.io': () => ({
          features: [{ geometry: { coordinates: [61.862, 30.958] }, properties: { osm_type: 'N', osm_id: 7, osm_value: 'hospital', name: 'شفاخانه ملکی', city: 'زرنج', state: 'نیمروز' } }],
        }),
      },
    );
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await typeInto(tree.root, prs.add.place, 'شفاخانه', true);
    await wait(SUGGEST_DELAY_MS + 50);
    await settle();
    expect(allText(tree.root)).toContain('شفاخانه ملکی');
    maplibre().__flyTo.mockClear();
    await pressId(tree.root, 'place-search-option-0');
    await settle();
    expect(maplibre().__flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [61.862, 30.958] }));
    expect(allText(tree.root)).not.toContain('ولایت: نیمروز');
  });

  it('writes the address of a pin into the field, from the server first', async () => {
    answer({
      'GET /geo/reverse': () => ({
        body: { provider: 'google', title: 'x', address: 'x', lat: 30.96, lng: 61.86, province: 'نیمروز', district: 'زرنج', neighborhood: 'ناحیه ۵', street: 'سرک ملی' },
      }),
    });
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await act(async () => tapMap(tree.root, 'location-picker-map', [61.86, 30.96]));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    expect(inputLabelled(tree.root, prs.add.place).props.value).toBe('نیمروز، زرنج، ناحیه ۵، سرک ملی');
    expect(allText(tree.root)).not.toContain('ولایت: نیمروز');
  });
});

describe('fullscreen map and drawing the plot', () => {
  const reverse = {
    'GET /geo/reverse': () => ({
      body: { provider: 'google', title: 'x', address: 'x', lat: 30.96, lng: 61.86, province: 'نیمروز', district: 'زرنج', neighborhood: '', street: '' },
    }),
  };
  const fullMap = 'location-picker-map-full';

  it('opens and closes fullscreen, keeping the pin placed in it', async () => {
    answer(reverse);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await pressId(tree.root, 'location-editor-fullscreen');
    expect(tree.root.findAllByType(Modal).some(m => m.props.visible && allText(m).includes(prs.map.done))).toBe(true);
    await act(async () => tapMap(tree.root, fullMap, [61.86, 30.96]));
    await pressId(tree.root, 'map-done');
    await settle();
    expect(allText(tree.root)).not.toContain(prs.map.tapToPlace);
  });

  it('draws the small map as a texture view (clipped by the sheet and its rounded box) and the fullscreen one as a surface', async () => {
    answer(reverse);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    const viewOf = (id: string) =>
      mapParts(tree.root, 'Map').find(n => n.props.testID === id)?.props.androidView;
    // A surface view is not cut off by a scrolling parent, which let the map spill out of the form's sheet.
    expect(viewOf('location-picker-map')).toBe('texture');
    await pressId(tree.root, 'location-editor-fullscreen');
    expect(viewOf(fullMap)).toBe('surface');
  });

  const submit = (root: ReactTestRenderer.ReactTestInstance) =>
    act(async () => {
      root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.submit)[0].props.onPress();
    });
  const fillLand = async (root: ReactTestRenderer.ReactTestInstance) => {
    await typeInto(root, prs.add.titleField, 'زمین در زرنج');
    await typeInto(root, prs.add.descriptionLabel, 'زمین هموار');
    await chooseType(root, 'LAND');
    await typeInto(root, prs.add.area, '2000');
    await typeInto(root, prs.dealPrice.SALE, '2500000');
  };
  const chosenPin = (root: ReactTestRenderer.ReactTestInstance) =>
    mapParts(root, 'ViewAnnotation').filter(n => n.props.id === 'chosen');

  it('has no way to draw a plot: no drawing button, no corners, no area, no mode switch', async () => {
    answer(reverse);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    for (const id of ['draw-plot', 'remove-plot', 'plot-use-area', 'location-editor-full-mode-plot', 'location-editor-full-mode-pin']) {
      expect(tree.root.findAll(n => n.props.testID === id)).toHaveLength(0);
    }
    await pressId(tree.root, 'location-editor-fullscreen');
    await act(async () => tapMap(tree.root, fullMap, [61.86, 30.96]));
    await act(async () => tapMap(tree.root, fullMap, [61.8601, 30.9601]));
    await act(async () => tapMap(tree.root, fullMap, [61.8602, 30.9602]));
    // Every tap moved the one pin; none of them added a corner or a second marker.
    expect(chosenPin(tree.root)).toHaveLength(1);
    expect(mapParts(tree.root, 'ViewAnnotation').filter(n => String(n.props.id).includes('corner'))).toHaveLength(0);
    expect(mapParts(tree.root, 'GeoJSONSource').filter(n => String(n.props.id).includes('plot'))).toHaveLength(0);
    expect(chosenPin(tree.root)[0].props.lngLat).toEqual([61.8602, 30.9602]);
  });

  it('saves the listing at the pin and sends no outline', async () => {
    answer({ ...reverse, 'POST /properties': () => ({ status: 201, body: listing() }) });
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await pressId(tree.root, 'location-editor-fullscreen');
    await act(async () => tapMap(tree.root, fullMap, [61.86, 30.96]));
    await pressId(tree.root, 'map-done');
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    expect(allText(tree.root)).not.toContain(prs.map.tapToPlace);
    expect(callsTo(fetchMock).some(c => c.path === '/geo/reverse')).toBe(true);
    await fillLand(tree.root);
    await submit(tree.root);
    await settle();
    const post = callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');
    expect(post).toBeDefined();
    expect(post!.body.lat).toBeCloseTo(30.96, 5);
    expect(post!.body.lng).toBeCloseTo(61.86, 5);
    expect('boundary' in post!.body).toBe(false);
  });

  it('draws the pin in the colour of the deal: green for a sale, blue for a rent, orange for a mortgage', async () => {
    answer(reverse);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await pressId(tree.root, 'location-editor-fullscreen');
    await act(async () => tapMap(tree.root, fullMap, [61.86, 30.96]));
    const pinColour = () => {
      const pin = tree.root.findAll(n => n.props.testID === 'deal-pin' && typeof n.type === 'string');
      expect(pin.length).toBeGreaterThan(0);
      // The head is the child that is round (its radius is half its size).
      const head = pin[0].findAll(n => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderRadius === 17)[0];
      return StyleSheet.flatten(head.props.style).backgroundColor;
    };
    // The deal is chosen on the form behind the map; close the map to reach it, then open it again.
    await pressId(tree.root, 'map-done');
    await settle();
    expect(pinColour()).toBe(dealColors.SALE.main);
    for (const deal of ['RENT', 'MORTGAGE_GROWI'] as const) {
      await act(async () => {
        tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.dealType[deal])[0].props.onPress();
      });
      await settle();
      expect(pinColour()).toBe(dealColors[deal].main);
    }
    expect(dealColors.SALE.main).not.toBe(dealColors.RENT.main);
    expect(dealColors.RENT.main).not.toBe(dealColors.MORTGAGE_GROWI.main);
  });

  it('puts the pin point, not the middle of its head, on the spot', async () => {
    answer(reverse);
    const tree = await render(screen(AddPropertyScreen));
    await settle();
    await pressId(tree.root, 'location-editor-fullscreen');
    await act(async () => tapMap(tree.root, fullMap, [61.86, 30.96]));
    expect(chosenPin(tree.root)[0].props.anchor).toBe('bottom');
  });
});

describe('who is selling, said on the details page', () => {
  const route = { params: { id: ID } };
  const shown = async (overrides: Record<string, unknown>) => {
    answer({
      [`GET /properties/${ID}`]: () => ({ body: listing({ lat: 30.97, lng: 61.87, ...overrides }) }),
      [`POST /properties/${ID}/view`]: () => ({ status: 204 }),
    });
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    return allText(tree.root);
  };

  it("names a private owner by their own name, not by the word «مالک»", async () => {
    const text = await shown({ owner_name: 'احمد ظاهر' });
    expect(text).toContain('احمد ظاهر');
  });

  it('says «مالک» only for an owner who never gave a name', async () => {
    expect(await shown({ owner_name: null })).toContain(prs.property.owner);
    expect(await shown({ owner_name: '   ' })).toContain(prs.property.owner);
  });

  it('names the agency, not its staff member, for an agency listing', async () => {
    const text = await shown({ agency_id: 'ag1', agency_name: 'دفتر املاک نور', owner_name: null });
    expect(text).toContain('دفتر املاک نور');
  });
});

describe('navigation to the property', () => {
  const pinned = listing({ lat: 30.97, lng: 61.87, boundary: { type: 'Polygon', coordinates: [[...corners(40), corners(40)[0]]] } });
  const route = { params: { id: ID } };

  it('stands the details skeleton in the page while the listing loads (no spinner), and replaces it with the page', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const loading = await render(screen(PropertyDetailsScreen, route));
    await settle();
    const skeleton = (root: ReactTestRenderer.ReactTestInstance) =>
      root.findAll(n => n.props.testID === 'details-skeleton');
    expect(skeleton(loading.root).length).toBeGreaterThan(0);
    expect(allText(loading.root)).toBe('');
    await act(async () => loading.unmount());

    answer({
      [`GET /properties/${ID}`]: () => ({ body: listing() }),
      [`POST /properties/${ID}/view`]: () => ({ status: 204 }),
    });
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    // The page is there at once and the skeleton fades out over it, then goes.
    expect(allText(tree.root)).toContain('زمین در زرنج');
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 450));
    });
    expect(skeleton(tree.root)).toHaveLength(0);
  });

  it('has no separate "مسیریابی به ملک" button in the page: directions live on the location map, and an old outline is still shown read-only', async () => {
    answer({ [`GET /properties/${ID}`]: () => ({ body: pinned }), [`POST /properties/${ID}/view`]: () => ({ status: 204 }) });
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    expect(allText(tree.root)).not.toContain(prs.route.button);
    expect(tree.root.findAll(n => n.props.testID === 'navigate-to-property')).toHaveLength(0);
    // The way to the navigation screen is the fullscreen button on the location card.
    expect(byTestId(tree.root, 'details-map-fullscreen')).toBeDefined();
    // A listing posted before outlines were dropped still shows its outline, drawn for looking only.
    expect(mapParts(tree.root, 'GeoJSONSource').some(n => n.props.id === 'details-outline')).toBe(true);
    // Its pin is the deal's pin, with the point on the spot.
    const pin = mapParts(tree.root, 'Marker').find(n => n.props.id === 'property');
    expect(pin!.props.anchor).toBe('bottom');
  });

  it('shows no directions without an exact pin: no fullscreen button, no route', async () => {
    answer({ [`GET /properties/${ID}`]: () => ({ body: listing() }) });
    maplibre().__location.position = fixAt(ZARANJ);
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    expect(allText(tree.root)).not.toContain(prs.route.button);
    expect(tree.root.findAll(n => n.props.testID === 'details-map-fullscreen')).toHaveLength(0);
    expect(callsTo(fetchMock).some(c => c.path === '/geo/route')).toBe(false);
  });

  it('draws the route from the phone and shows distance, arrival time and live speed', async () => {
    const line = [
      [61.86, 30.96],
      [61.865, 30.965],
      [61.87, 30.97],
    ];
    answer({
      [`GET /properties/${ID}`]: () => ({ body: pinned }),
      'GET /geo/route': () => ({ body: { provider: 'google', distance_m: 1400, duration_s: 240, coordinates: line } }),
    });
    maplibre().__location.position = fixAt(ZARANJ);
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    await pressId(tree.root, 'details-map-fullscreen');
    await settle(6);

    const ask = callsTo(fetchMock).find(c => c.path === '/geo/route')!;
    expect(ask.query).toEqual({ from_lat: '30.96', from_lng: '61.86', to_lat: '30.97', to_lng: '61.87' });
    expect(mapParts(tree.root, 'GeoJSONSource').find(n => n.props.id === 'route')!.props.data.features[0].geometry.coordinates).toEqual(line);

    // Driving at 12.5 m/s (45 km/h), a little along the route.
    await act(async () => {
      maplibre().__emitLocation(fixAt({ latitude: 30.962, longitude: 61.862 }, { speed: 12.5 }));
    });
    await settle();
    const hud = (id: string) => allText(tree.root.findAll(n => n.props.testID === id)[0]);
    expect(hud('hud-speed')).toContain('۴۵ km/h');
    expect(hud('hud-distance')).toMatch(/(متر|کیلومتر)$/);
    expect(hud('hud-eta')).toMatch(/دقیقه/);
  });

  it('says where the trip ends: "you have arrived"', async () => {
    answer({
      [`GET /properties/${ID}`]: () => ({ body: pinned }),
      'GET /geo/route': () => ({ body: { provider: 'google', distance_m: 20, duration_s: 10, coordinates: [[61.8699, 30.9699], [61.87, 30.97]] } }),
    });
    maplibre().__location.position = fixAt({ latitude: 30.9699, longitude: 61.8699 });
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    await pressId(tree.root, 'details-map-fullscreen');
    await settle(6);
    expect(allText(tree.root)).toContain(prs.route.arrived);
  });

  it('does not open the route screen, or ask for a route, until the phone has a position', async () => {
    answer({
      [`GET /properties/${ID}`]: () => ({ body: pinned }),
      'GET /geo/route': () => ({ body: { provider: 'google', distance_m: 1, duration_s: 1, coordinates: [] } }),
    });
    maplibre().__location.grant = false; // the person refuses the location permission
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    await pressId(tree.root, 'details-map-fullscreen');
    await settle(6);
    expect(maplibre().__location.requests).toBeGreaterThan(0);
    expect(callsTo(fetchMock).some(c => c.path === '/geo/route')).toBe(false);
    expect(tree.root.findAll(n => n.props.testID === 'navigation-close')).toHaveLength(0);
    // The card that explains and leads to the settings is there instead.
    expect(tree.root.findAll(n => n.props.testID === 'location-permission').length).toBeGreaterThan(0);
    maplibre().__location.grant = true;
  });

  it('does not draw a route for a phone that is outside Afghanistan', async () => {
    answer({
      [`GET /properties/${ID}`]: () => ({ body: pinned }),
      'GET /geo/route': () => ({ body: { provider: 'google', distance_m: 1, duration_s: 1, coordinates: [] } }),
    });
    maplibre().__location.position = fixAt({ latitude: 51.5, longitude: -0.12 });
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    await pressId(tree.root, 'details-map-fullscreen');
    await settle(6);
    expect(callsTo(fetchMock).some(c => c.path === '/geo/route')).toBe(false);
    expect(tree.root.findAll(n => n.props.testID === 'navigation-close')).toHaveLength(0);
  });

  describe('a route that is reliable on the screen', () => {
    // A road that starts about 170 m from the phone and ends about 170 m short of the listing, as a router's does.
    const road = [
      [61.86, 30.9615],
      [61.865, 30.9615],
      [61.869, 30.9685],
    ];
    const roadReply = { body: { provider: 'google', distance_m: 1300, duration_s: 200, coordinates: road } };
    const open = async (extra: Record<string, Handler> = {}, outside: Record<string, Handler> = {}) => {
      answer(
        { [`GET /properties/${ID}`]: () => ({ body: pinned }), 'GET /geo/route': () => roadReply, ...extra },
        outside,
      );
      maplibre().__location.position = fixAt(ZARANJ);
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      await pressId(tree.root, 'details-map-fullscreen');
      await settle(6);
      return tree;
    };
    const sourceData = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
      mapParts(root, 'GeoJSONSource').find(n => n.props.id === id)!.props.data;

    it('joins the phone to the start of the road, and the end of the road to the listing, with dashed connectors', async () => {
      const tree = await open();
      const connectors = sourceData(tree.root, 'connectors').features;
      expect(connectors).toHaveLength(2);
      expect(connectors[0].geometry.coordinates[0]).toEqual([ZARANJ.longitude, ZARANJ.latitude]);
      expect(connectors[0].geometry.coordinates[1]).toEqual(road[0]);
      expect(connectors[1].geometry.coordinates).toEqual([road[2], [61.87, 30.97]]);
      const dashed = mapParts(tree.root, 'Layer').find(n => n.props.id === 'connectors-line')!;
      expect(dashed.props.paint['line-dasharray']).toBeDefined();
      // The distance on the HUD counts them: the road is about 1.3 km, the two gaps add to it.
      const text = allText(tree.root.findAll(n => n.props.testID === 'hud-distance')[0]);
      expect(text).not.toBe('');
    });

    it('draws no connector where the phone is already on the road', async () => {
      answer({
        [`GET /properties/${ID}`]: () => ({ body: pinned }),
        'GET /geo/route': () => ({
          body: { provider: 'google', distance_m: 1300, duration_s: 200, coordinates: [[ZARANJ.longitude, ZARANJ.latitude], [61.87, 30.97]] },
        }),
      });
      maplibre().__location.position = fixAt(ZARANJ);
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      await pressId(tree.root, 'details-map-fullscreen');
      await settle(6);
      expect(sourceData(tree.root, 'connectors').features).toHaveLength(0);
    });

    it('marks the phone with the pulsing locator and the listing with its deal-coloured pin', async () => {
      const tree = await open();
      expect(tree.root.findAll(n => n.props.testID === 'driver-position').length).toBeGreaterThan(0);
      expect(tree.root.findAll(n => n.props.testID === 'user-locator').length).toBeGreaterThan(0);
      expect(tree.root.findAll(n => n.props.testID === 'deal-pin').length).toBeGreaterThan(0);
    });

    it('keeps the road on the screen when a new route cannot be had, instead of swapping it for a straight line', async () => {
      const tree = await open();
      expect(sourceData(tree.root, 'route').features[0].geometry.coordinates).toEqual(road);
      // From here no router answers.
      answer(
        { [`GET /properties/${ID}`]: () => ({ body: pinned }), 'GET /geo/route': () => ({ status: 503, body: {} }) },
        { 'router.project-osrm.org': () => 'down' },
      );
      // The phone leaves the road (about 600 m east), a minute later: time for a new route, which fails.
      const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
      try {
        await act(async () => {
          maplibre().__emitLocation(fixAt({ latitude: 30.9615, longitude: 61.8665 }));
        });
        await settle(6);
      } finally {
        later.mockRestore();
      }
      expect(callsTo(fetchMock).filter(c => c.path === '/geo/route').length).toBeGreaterThan(1);
      expect(sourceData(tree.root, 'route').features[0].geometry.coordinates).toEqual(road);
      expect(allText(tree.root)).not.toContain(prs.route.straight);
    });

    it('does not ask for a new route while the phone stands still, however much the fix wanders', async () => {
      const tree = await open();
      const asked = () => callsTo(fetchMock).filter(c => c.path === '/geo/route').length;
      const before = asked();
      const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
      try {
        // 40 m jumps around the spot it was first asked from: off the 60 m line is not reached, and it has not moved 50 m.
        for (const dLat of [0.0003, -0.0003, 0.0002]) {
          await act(async () => {
            maplibre().__emitLocation(fixAt({ latitude: ZARANJ.latitude + dLat, longitude: ZARANJ.longitude }));
          });
        }
        await settle(4);
      } finally {
        later.mockRestore();
      }
      expect(asked()).toBe(before);
      expect(tree.root.find(n => n.props.testID === 'navigation-map')).toBeDefined();
    });

    it('says the listing is close and goes straight to it, instead of a long way round, for a short trip', async () => {
      answer({
        [`GET /properties/${ID}`]: () => ({ body: pinned }),
        'GET /geo/route': () => ({
          body: { provider: 'google', distance_m: 3000, duration_s: 400, coordinates: [[61.8693, 30.9693], [61.88, 30.99], [61.87, 30.97]] },
        }),
      });
      maplibre().__location.position = fixAt({ latitude: 30.9693, longitude: 61.8693 });
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      await pressId(tree.root, 'details-map-fullscreen');
      await settle(6);
      expect(allText(tree.root)).toContain(prs.route.near);
      expect(allText(tree.root)).not.toContain(prs.route.straight);
      expect(sourceData(tree.root, 'route').features[0].geometry.coordinates).toEqual([
        [61.8693, 30.9693],
        [61.87, 30.97],
      ]);
    });
  });

  describe('the fullscreen button on the details map', () => {
    const line = [
      [61.86, 30.96],
      [61.865, 30.965],
      [61.87, 30.97],
    ];
    const withRoute = () =>
      answer({
        [`GET /properties/${ID}`]: () => ({ body: pinned }),
        'GET /geo/route': () => ({ body: { provider: 'google', distance_m: 1400, duration_s: 240, coordinates: line } }),
      });
    const hud = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
      allText(root.findAll(n => n.props.testID === id)[0]);

    it('is the way to the navigation screen, on the location card of a pinned listing', async () => {
      withRoute();
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      const button = byTestId(tree.root, 'details-map-fullscreen');
      expect(button).toBeDefined();
      const host = tree.root.findAll(n => n.props.testID === 'details-map-fullscreen' && n.props.accessibilityLabel)[0];
      expect(host.props.accessibilityLabel).toBe(prs.map.fullscreen);
    });

    it('draws the route on the small map by itself when the phone may be located, and the big map opens with it worked out: line, distance and arrival time', async () => {
      withRoute();
      maplibre().__location.position = fixAt(ZARANJ);
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle(6);
      // On the page, before anything is pressed: the road, the phone's own spot and a line with the distance and time.
      const ask = callsTo(fetchMock).find(c => c.path === '/geo/route')!;
      expect(ask.query).toEqual({ from_lat: '30.96', from_lng: '61.86', to_lat: '30.97', to_lng: '61.87' });
      const inline = mapParts(tree.root, 'GeoJSONSource').find(n => n.props.id === 'details-route')!;
      expect(inline.props.data.features[0].geometry.coordinates).toEqual(line);
      expect(tree.root.findAll(n => n.props.testID === 'details-my-position').length).toBeGreaterThan(0);
      expect(allText(tree.root.findAll(n => n.props.testID === 'details-route-summary')[0])).toMatch(/(متر|کیلومتر)/);
      expect(tree.root.findAll(n => n.props.testID === 'navigation-map')).toHaveLength(0);

      await pressId(tree.root, 'details-map-fullscreen');
      await settle(6);
      expect(mapParts(tree.root, 'GeoJSONSource').find(n => n.props.id === 'route')!.props.data.features[0].geometry.coordinates).toEqual(line);
      expect(hud(tree.root, 'hud-distance')).toMatch(/(متر|کیلومتر)$/);
      expect(hud(tree.root, 'hud-eta')).toMatch(/دقیقه/);
      expect(tree.root.findAll(n => n.props.testID === 'navigation-map').length).toBeGreaterThan(0);
      // And it closes again to the page, which keeps its own small route.
      await pressId(tree.root, 'navigation-close');
      await settle();
      expect(tree.root.findAll(n => n.props.testID === 'navigation-map')).toHaveLength(0);
      expect(tree.root.findAll(n => n.props.testID === 'details-map-fullscreen').length).toBeGreaterThan(0);
    });

    it('draws no route on the small map, and never shows a permission prompt by itself, when the phone was never allowed', async () => {
      withRoute();
      maplibre().__location.grant = false;
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle(6);
      expect(callsTo(fetchMock).some(c => c.path === '/geo/route')).toBe(false);
      expect(tree.root.findAll(n => n.props.testID === 'location-permission')).toHaveLength(0);
      expect(tree.root.findAll(n => n.props.testID === 'details-route-summary')).toHaveLength(0);
      maplibre().__location.grant = true;
    });

    it('does not draw a route from nowhere: with the location refused it explains instead', async () => {
      withRoute();
      maplibre().__location.grant = false;
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      await pressId(tree.root, 'details-map-fullscreen');
      await settle(6);
      expect(callsTo(fetchMock).some(c => c.path === '/geo/route')).toBe(false);
      expect(tree.root.findAll(n => n.props.testID === 'navigation-close')).toHaveLength(0);
      expect(tree.root.findAll(n => n.props.testID === 'location-permission').length).toBeGreaterThan(0);
      maplibre().__location.grant = true;
    });

    it('is not offered for a listing that has no exact pin', async () => {
      answer({ [`GET /properties/${ID}`]: () => ({ body: listing() }) });
      const tree = await render(screen(PropertyDetailsScreen, route));
      await settle();
      expect(tree.root.findAll(n => n.props.testID === 'details-map-fullscreen')).toHaveLength(0);
    });
  });

  it('draws a dashed straight line and says so when no route can be had, and stops listening when closed', async () => {
    answer({ [`GET /properties/${ID}`]: () => ({ body: pinned }) }, { 'router.project-osrm.org': () => 'down' });
    maplibre().__location.position = fixAt(ZARANJ);
    const tree = await render(screen(PropertyDetailsScreen, route));
    await settle();
    await pressId(tree.root, 'details-map-fullscreen');
    await settle(6);
    expect(allText(tree.root)).toContain(prs.route.straight);
    // Two listeners: the page's own small map and the route screen's.
    expect(maplibre().__locationListeners.size).toBe(2);
    await pressId(tree.root, 'navigation-close');
    await settle();
    expect(maplibre().__locationListeners.size).toBe(1);
    await act(async () => {
      tree.unmount();
    });
    mounted.splice(mounted.indexOf(tree), 1);
    expect(maplibre().__locationListeners.size).toBe(0);
  });
});
