import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  inputLabelled,
  mapParts,
  mockApi,
  pressableWith,
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
import HomeScreen from '../src/screens/home/HomeScreen';
import AddPropertyScreen, {
  LOOKUP_DELAY_MS,
} from '../src/screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import PropertyMap from '../src/components/PropertyMap';
import { AFGHANISTAN_CAMERA } from '../src/map/geo';

const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: null,
  avatar: null,
};
const listing = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'آپارتمان',
  description: 'تازه‌ساز',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 1000,
  currency: 'AFGHANI',
  area_sqm: 100,
  bedrooms: 2,
  bathrooms: 1,
  province: 'کابل',
  district: 'شهر نو',
  neighborhood: 'قلعه فتح‌الله',
  address: 'سرک چهارم',
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
});
/** Renders a screen with a fake navigator (and route) inside a fresh query cache. */
const screenElement = <P extends object>(
  Screen: React.ComponentType<P>,
  nav: ReturnType<typeof navigation> = navigation(),
  route: object = {},
) => {
  const props = {
    navigation: nav,
    route: { params: undefined, ...route },
  } as unknown as P;
  return withQuery(<Screen {...props} />);
};

const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);

beforeAll(async () => {
  await initI18n();
});
// Screens from earlier tests would otherwise stay mounted and keep fetching against the next test's mock.
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user };
});

const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const act = ReactTestRenderer.act;
/**
 * Lets chained fetches finish (a screen fetches, renders, then a child fetches). React Query hands
 * results to components on a timer, not a microtask, so waiting a turn of the event loop matters.
 */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });
const type = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  text: string,
) =>
  act(async () => {
    inputLabelled(root, label).props.onChangeText(text);
  });

/** Waits out the pause between the last tap on the map and the address question, then lets the answer land. */
const afterLookupDelay = () =>
  act(async () => {
    await new Promise<void>(resolve =>
      setTimeout(() => resolve(), LOOKUP_DELAY_MS + 60),
    );
  });

type Reverse = { address?: Record<string, string> } | 'down';
/**
 * Puts the address service in front of the API mock: it answers the geocoder's own URL (the API client reads
 * text, the geocoder reads json, so it needs a reply of its own) and hands everything else on.
 */
function answerGeocoder(
  reverse: Reverse,
  routes: Parameters<typeof mockApi>[1],
) {
  mockApi(fetchMock, routes);
  const api = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!url.startsWith('https://nominatim.openstreetmap.org/')) {
      return api(url, init);
    }
    if (reverse === 'down') throw new Error('offline');
    return { ok: true, status: 200, json: async () => reverse };
  });
}
const geocoderCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith('https://nominatim.openstreetmap.org/'),
  );

const KABUL_SPOT: Reverse = {
  address: {
    state: 'Kabul',
    city_district: 'ناحیه سوم',
    suburb: 'شهر نو',
    road: 'سرک چهارم',
  },
};

/** Fills in everything the form requires when there is no pin: the written address included. */
async function fillForm(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.price, '1200000');
  await type(root, prs.add.area, '120');
  await type(root, prs.add.district, 'شهر نو');
  await type(root, prs.add.neighborhood, 'قلعه فتح‌الله');
  await type(root, prs.add.address, 'سرک چهارم، نزدیک پارک');
  await press(root, prs.home.selectProvince); // opens the province list
  await press(root, 'کابل');
}
/** The same, up to and including the basics, but no address at all: the pin is meant to supply it. */
async function fillBasics(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.price, '1200000');
  await type(root, prs.add.area, '120');
}
const optional = (label: string) => `${label} (${prs.common.optional})`;
const posted = () =>
  callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');

describe('AddPropertyScreen: location is free and has two ways in', () => {
  const routes = {
    'POST /properties': { status: 201, body: listing() },
  };

  it('shows the map to everyone, with no price, no buy button and no payment calls', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();

    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
    const text = allText(tree.root);
    expect(text).toContain(prs.map.tapToPlace);
    expect(text).not.toContain('۳۰');
    expect(text).not.toContain('؋ ۳۰');
    expect(
      callsTo(fetchMock).filter(
        c => c.path.includes('map-location') || c.path.includes('hesabpay'),
      ),
    ).toHaveLength(0);
  });

  it('shows the same free map to an agency', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    mockAuth = { status: 'signedIn', user: { ...user, role: 'AGENCY' } };
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
  });

  it('requires the written address while there is no pin, and says so', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    expect(allText(tree.root)).toContain(prs.add.addressRequired);

    await fillBasics(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeUndefined();
    expect(allText(tree.root)).toContain(prs.add.required);
  });

  it('lets them write the address and publish without any pin', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();

    expect(posted()?.body).toMatchObject({
      province: 'کابل',
      district: 'شهر نو',
      neighborhood: 'قلعه فتح‌الله',
    });
    expect(posted()?.body).not.toHaveProperty('lat');
    expect(posted()?.body).not.toHaveProperty('lng');
    expect(geocoderCalls()).toHaveLength(0); // no pin, nothing to ask
  });

  it('fills province, district, neighbourhood and street from a pin, and sends the pin', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillBasics(tree.root);
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    expect(mapParts(tree.root, 'Marker')).toHaveLength(1);
    expect(allText(tree.root)).toContain(prs.add.addressOptional);
    await afterLookupDelay();

    expect(geocoderCalls()).toHaveLength(1);
    expect(String(geocoderCalls()[0][0])).toContain('lat=34.5');
    expect(String(geocoderCalls()[0][0])).toContain('lon=69.1');
    expect(allText(tree.root)).toContain(prs.add.filled);
    expect(
      inputLabelled(tree.root, optional(prs.add.district)).props.value,
    ).toBe('ناحیه سوم');
    expect(
      inputLabelled(tree.root, optional(prs.add.neighborhood)).props.value,
    ).toBe('شهر نو');
    expect(
      inputLabelled(tree.root, optional(prs.add.address)).props.value,
    ).toBe('سرک چهارم');

    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({
      lat: 34.5,
      lng: 69.1, // latitude is the second map coordinate
      province: 'کابل',
      district: 'ناحیه سوم',
    });
  });

  it('publishes with a pin and no written address when the service knows nothing, guessing the province', async () => {
    answerGeocoder('down', routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillBasics(tree.root);
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    expect(allText(tree.root)).toContain(prs.add.provinceGuessed);

    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({
      lat: 34.5,
      lng: 69.1,
      province: 'کابل',
    });
  });

  it('asks the service once for a burst of taps, about the last spot', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () => {
      tapMap(tree.root, 'location-picker-map', [69.0, 34.4]);
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]);
    });
    await afterLookupDelay();
    expect(geocoderCalls()).toHaveLength(1);
    expect(String(geocoderCalls()[0][0])).toContain('lat=34.5');
  });

  it('never overwrites what the person typed when the pin moves', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    await type(tree.root, optional(prs.add.address), 'خانه‌ی شماره ۵');

    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.2, 34.6]),
    );
    await afterLookupDelay();
    expect(
      inputLabelled(tree.root, optional(prs.add.address)).props.value,
    ).toBe('خانه‌ی شماره ۵');
  });

  it('ignores a tap outside Afghanistan and says why', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [-0.12, 51.5]),
    );
    expect(mapParts(tree.root, 'Marker')).toHaveLength(0);
    expect(allText(tree.root)).toContain(prs.map.outside);
    await afterLookupDelay();
    expect(geocoderCalls()).toHaveLength(0);
  });
});

describe('AddPropertyScreen: the form itself', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };

  it('lists the property types in the agreed order', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    const text = allText(tree.root);
    const order = [
      prs.propertyType.HOUSE_HAWILI,
      prs.propertyType.APARTMENT,
      prs.propertyType.OFFICE_SHOP,
      prs.propertyType.LAND,
      prs.propertyType.GARDEN_VILLA,
      prs.propertyType.GARAGE_OTHER,
    ].map(label => text.indexOf(label));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('puts rooms and bathrooms next to price and area, and sends what the steppers say', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain(prs.add.bedrooms);
    expect(text).toContain(prs.add.bathrooms);

    await fillForm(tree.root);
    const plus = (label: string) =>
      act(async () => {
        tree.root
          .find(
            n =>
              typeof n.props.onPress === 'function' &&
              n.props.accessibilityLabel === `${label}: ${prs.common.increase}`,
          )
          .props.onPress();
      });
    await plus(prs.add.bedrooms);
    await plus(prs.add.bedrooms);
    await plus(prs.add.bathrooms);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({ bedrooms: 2, bathrooms: 1 });
  });

  it('hides the room counts for land', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await press(tree.root, prs.propertyType.LAND);
    expect(allText(tree.root)).not.toContain(prs.add.bedrooms);
  });

  it('treats the description as optional', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    expect(allText(tree.root)).toContain(prs.add.descriptionField);
    await fillForm(tree.root); // fillForm leaves the description empty
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
  });
});

describe('AddPropertyScreen: editing my listing', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('opens filled in, saves with PATCH and goes back', async () => {
    answerGeocoder(KABUL_SPOT, {
      [`GET /properties/${id}`]: {
        body: listing({ lat: 34.5, lng: 69.1, province: 'کابل' }),
      },
      [`PATCH /properties/${id}`]: { body: listing({ title: 'تازه' }) },
    });
    const nav = navigation();
    const tree = await render(
      screenElement(AddPropertyScreen, nav, { params: { propertyId: id } }),
    );
    await settle();

    expect(inputLabelled(tree.root, prs.add.titleField).props.value).toBe(
      'آپارتمان',
    );
    expect(mapParts(tree.root, 'Marker')).toHaveLength(1); // the existing pin
    expect(allText(tree.root)).toContain(prs.add.save);
    expect(nav.setOptions).toHaveBeenCalledWith({ title: prs.add.editTitle });
    expect(geocoderCalls()).toHaveLength(0); // loading a pin is not placing one

    await type(tree.root, prs.add.titleField, 'آپارتمان تازه');
    await press(tree.root, prs.add.save);
    await settle();
    const patch = callsTo(fetchMock).find(c => c.method === 'PATCH');
    expect(patch?.path).toBe(`/properties/${id}`);
    expect(patch?.body).toMatchObject({
      title: 'آپارتمان تازه',
      lat: 34.5,
      lng: 69.1,
    });
    expect(callsTo(fetchMock).some(c => c.method === 'POST')).toBe(false);
    expect(nav.goBack).toHaveBeenCalled();
  });
});

describe('HomeScreen: map view', () => {
  const page = (data: unknown[]) => ({
    data,
    meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
  });

  it('opens on the map and asks only for the listings in view; the list asks for everything', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {
      'GET /properties': { body: page([listing({ lat: 34.5, lng: 69.1 })]) },
      'GET /agencies/map': { body: [] },
    });
    const tree = await render(screenElement(HomeScreen, navigation()));
    await settle();
    const propertyCalls = () =>
      callsTo(fetchMock).filter(c => c.path === '/properties');
    // Map first: an area of the map (which only pinned listings can be inside), never "everything".
    expect(
      propertyCalls().every(
        c =>
          c.query.min_lat !== undefined &&
          c.query.max_lng !== undefined &&
          c.query.has_location === undefined,
      ),
    ).toBe(true);
    expect(mapParts(tree.root, 'Marker').map(m => m.props.id)).toEqual([
      expect.stringMatching(/^property:/),
    ]);

    await press(tree.root, prs.home.list);
    await settle();
    expect(propertyCalls().at(-1)!.query.min_lat).toBeUndefined();
    expect(propertyCalls().at(-1)!.query.has_location).toBeUndefined();
  });

  it('explains an empty map instead of showing the list message', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, { 'GET /properties': { body: page([]) } });
    const tree = await render(screenElement(HomeScreen, navigation()));
    await settle();
    expect(allText(tree.root)).toContain(prs.home.noMapResults);
  });
});

describe('PropertyMap', () => {
  const baseProps = {
    agencies: [],
    selected: null,
    userLocation: null,
    onSelectProperty: jest.fn(),
    onSelectAgency: jest.fn(),
    onOpenCluster: jest.fn(),
  };

  it('draws pinned listings only and reports which one was tapped', async () => {
    const pinned = listing({ id: 'a', lat: 34.5, lng: 69.1 });
    const unpinned = listing({ id: 'b' });
    const onSelectProperty = jest.fn();
    const tree = await render(
      <PropertyMap
        {...baseProps}
        properties={[pinned, unpinned] as never}
        camera={AFGHANISTAN_CAMERA}
        onSelectProperty={onSelectProperty}
      />,
    );
    const markers = mapParts(tree.root, 'Marker');
    expect(markers.map(m => m.props.id)).toEqual(['property:a']);
    expect(markers[0].props.lngLat).toEqual([69.1, 34.5]);

    markers[0].props.onPress();
    expect(onSelectProperty).toHaveBeenCalledWith(pinned);
  });

  it('flies to a new view when the camera changes, but not on the first draw', async () => {
    const { __flyTo } = jest.requireMock('@maplibre/maplibre-react-native');
    __flyTo.mockClear();
    const props = { ...baseProps, properties: [] };
    const tree = await render(
      <PropertyMap {...props} camera={AFGHANISTAN_CAMERA} />,
    );
    expect(__flyTo).not.toHaveBeenCalled();
    await act(async () => {
      tree.update(
        <PropertyMap {...props} camera={{ center: [62.2, 34.34], zoom: 9 }} />,
      );
    });
    expect(__flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [62.2, 34.34], zoom: 9 }),
    );
  });

  it('draws no credit, button or label on the map itself (the credit is in the Account tab)', async () => {
    const tree = await render(
      <PropertyMap
        {...baseProps}
        properties={[]}
        camera={AFGHANISTAN_CAMERA}
      />,
    );
    expect(allText(tree.root)).not.toContain('OpenStreetMap');
    expect(
      tree.root.findAll(
        n =>
          n.props.testID === 'map-credit-button' ||
          n.props.testID === 'map-credit-text',
      ),
    ).toHaveLength(0);
    // And MapLibre's own attribution control is switched off too.
    expect(mapParts(tree.root, 'Map')[0].props.attribution).toBe(false);
  });
});

describe('PropertyDetailsScreen: location', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const route = { params: { id } };

  it('shows a map for a pinned listing', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${id}`]: { body: listing({ lat: 34.5, lng: 69.1 }) },
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
    expect(allText(tree.root)).toContain('قلعه فتح‌الله'); // the neighborhood is part of the place line
  });

  it('shows the written place and a note, not a map, when there is no pin', async () => {
    mockApi(fetchMock, { [`GET /properties/${id}`]: { body: listing() } });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    const text = allText(tree.root);
    expect(text).toContain(prs.map.noExact);
    expect(text).toContain('شهر نو');
    expect(text).toContain('قلعه فتح‌الله');
  });
});
