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
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import CheckoutScreen from '../src/screens/payments/CheckoutScreen';
import HomeScreen from '../src/screens/home/HomeScreen';
import AddPropertyScreen from '../src/screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import SetLocationScreen from '../src/screens/property/SetLocationScreen';
import PropertyMap from '../src/components/PropertyMap';
import { AFGHANISTAN_CAMERA } from '../src/map/geo';

const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: null,
  avatar: null,
};
const PRICING = {
  currency: 'AFGHANI',
  subscription: { MONTHLY: 1000, QUARTERLY: 2700, YEARLY: 9600 },
  ladder: 50,
  featured_ad: 100,
  map_location: 30,
  featured_ad_days: 7,
};
const STATUS_NONE = {
  unlimited: false,
  unlimited_reason: null,
  tokens_available: 0,
};
const STATUS_TOKENS = {
  unlimited: false,
  unlimited_reason: null,
  tokens_available: 2,
};
const STATUS_AGENCY = {
  unlimited: true,
  unlimited_reason: 'AGENCY_SUBSCRIPTION',
  tokens_available: 0,
};

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  agency_id: null,
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

/** Fills in everything the form requires except the pin. */
async function fillForm(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.price, '1200000');
  await type(root, prs.add.area, '120');
  await type(root, prs.add.district, 'شهر نو');
  await type(root, prs.add.neighborhood, 'قلعه فتح‌الله');
  await type(root, prs.add.address, 'سرک چهارم، نزدیک پارک');
  await type(root, prs.add.descriptionField, 'تازه‌ساز و روشن');
  await press(root, prs.home.selectProvince); // opens the province list
  await press(root, 'کابل');
}

describe('AddPropertyScreen: exact map location', () => {
  const routes = (status: object) => ({
    'GET /map-location/status': { body: status },
    'GET /hesabpay/pricing': { body: PRICING },
    'POST /properties': { status: 201, body: listing() },
  });

  it('keeps the map picker away from people who have not paid, and shows the price instead', async () => {
    mockApi(fetchMock, routes(STATUS_NONE));
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();

    expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    const text = allText(tree.root);
    expect(text).toContain('۳۰'); // the price, in Persian digits
    expect(text).toContain(prs.map.buy);

    await press(tree.root, prs.map.buy);
    expect(nav.navigate).toHaveBeenCalledWith('Checkout', { tab: 'map' });
  });

  it('still lets them write province, district and neighborhood and publish without a pin', async () => {
    mockApi(fetchMock, routes(STATUS_NONE));
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();

    const post = callsTo(fetchMock).find(
      c => c.method === 'POST' && c.path === '/properties',
    );
    expect(post?.body).toMatchObject({
      province: 'کابل',
      district: 'شهر نو',
      neighborhood: 'قلعه فتح‌الله',
    });
    expect(post?.body).not.toHaveProperty('lat');
    expect(post?.body).not.toHaveProperty('lng');
  });

  it('shows the picker to someone holding a prepaid pin and sends the tapped point', async () => {
    mockApi(fetchMock, routes(STATUS_TOKENS));
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    expect(allText(tree.root)).toContain(prs.map.usesCredit);
    expect(mapParts(tree.root, 'Marker')).toHaveLength(0);

    await fillForm(tree.root);
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    expect(mapParts(tree.root, 'Marker')).toHaveLength(1);
    await press(tree.root, prs.add.submit);
    await settle();

    const post = callsTo(fetchMock).find(
      c => c.method === 'POST' && c.path === '/properties',
    );
    expect(post?.body).toMatchObject({ lat: 34.5, lng: 69.1 }); // latitude is the second map coordinate
  });

  it('shows the picker to a subscribed agency without mentioning credits', async () => {
    mockApi(fetchMock, routes(STATUS_AGENCY));
    mockAuth = { status: 'signedIn', user: { ...user, role: 'AGENCY' } };
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain(prs.map.includedPlan);
    expect(text).not.toContain(prs.map.usesCredit);
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
  });

  it('ignores a tap outside Afghanistan and says why', async () => {
    mockApi(fetchMock, routes(STATUS_TOKENS));
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [-0.12, 51.5]),
    );
    expect(mapParts(tree.root, 'Marker')).toHaveLength(0);
    expect(allText(tree.root)).toContain(prs.map.outside);
  });

  it('offers to buy when the server says the pin needs the add-on (balance was stale)', async () => {
    mockApi(fetchMock, {
      ...routes(STATUS_TOKENS),
      'POST /properties': {
        status: 403,
        body: { code: 'MAP_LOCATION_REQUIRED', message: 'x' },
      },
    });
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    await fillForm(tree.root);
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await press(tree.root, prs.add.submit);
    await settle();

    expect(allText(tree.root)).toContain(prs.map.required);
    // The balance is fetched again, since it was evidently out of date.
    expect(
      callsTo(fetchMock).filter(c => c.path === '/map-location/status').length,
    ).toBeGreaterThan(1);
    await press(tree.root, prs.map.buy);
    expect(nav.navigate).toHaveBeenCalledWith('Checkout', { tab: 'map' });
  });
});

describe('SetLocationScreen', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const route = { params: { propertyId: id } };

  it('lets someone with a prepaid pin place the first pin and saves exactly lat/lng', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${id}`]: { body: listing() },
      'GET /map-location/status': { body: STATUS_TOKENS },
      'GET /hesabpay/pricing': { body: PRICING },
      [`PATCH /properties/${id}`]: { body: listing({ lat: 34.5, lng: 69.1 }) },
    });
    const nav = navigation();
    const tree = await render(screenElement(SetLocationScreen, nav, route));
    await settle();

    await press(tree.root, prs.map.save);
    expect(allText(tree.root)).toContain(prs.map.pickFirst); // nothing chosen yet
    expect(callsTo(fetchMock).some(c => c.method === 'PATCH')).toBe(false);

    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await press(tree.root, prs.map.save);
    await settle();
    const patch = callsTo(fetchMock).find(c => c.method === 'PATCH');
    expect(patch?.body).toEqual({ lat: 34.5, lng: 69.1 });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('sends people without a pin or a plan to buy instead of showing a map', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${id}`]: { body: listing() },
      'GET /map-location/status': { body: STATUS_NONE },
      'GET /hesabpay/pricing': { body: PRICING },
    });
    const nav = navigation();
    const tree = await render(screenElement(SetLocationScreen, nav, route));
    await settle();
    expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    await press(tree.root, prs.map.buy);
    expect(nav.navigate).toHaveBeenCalledWith('Checkout', { tab: 'map' });
  });

  it('lets anyone move a pin that is already there, without asking about credits', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${id}`]: { body: listing({ lat: 34.5, lng: 69.1 }) },
      [`PATCH /properties/${id}`]: { body: listing({ lat: 34.6, lng: 69.2 }) },
    });
    const tree = await render(
      screenElement(SetLocationScreen, navigation(), route),
    );
    await settle();
    expect(allText(tree.root)).toContain(prs.map.moveFree);
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
    expect(mapParts(tree.root, 'Marker')).toHaveLength(1); // the existing pin
    expect(
      callsTo(fetchMock).some(c => c.path === '/map-location/status'),
    ).toBe(false);

    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.2, 34.6]),
    );
    await press(tree.root, prs.map.save);
    await settle();
    expect(callsTo(fetchMock).find(c => c.method === 'PATCH')?.body).toEqual({
      lat: 34.6,
      lng: 69.2,
    });
  });
});

describe('CheckoutScreen: map location tab', () => {
  const route = { params: { tab: 'map' } };
  const base = {
    'GET /hesabpay/pricing': { body: PRICING },
    'GET /properties/mine': {
      body: {
        data: [],
        meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
      },
    },
  };
  const openUrl = jest.fn(async () => true);
  beforeEach(() => {
    jest
      .spyOn(require('react-native').Linking, 'openURL')
      .mockImplementation(openUrl);
  });

  it('buys the add-on with nothing but the purpose (the server sets the price)', async () => {
    mockApi(fetchMock, {
      ...base,
      'GET /map-location/status': { body: STATUS_NONE },
      'POST /hesabpay/payments': {
        status: 201,
        body: {
          id: 'pay1',
          purpose: 'MAP_LOCATION',
          status: 'PENDING',
          amount: 30,
          currency: 'AFGHANI',
          created_at: '2026-10-12T00:00:00Z',
          payment_url: 'https://pay.example/x',
        },
      },
      'GET /hesabpay/payments/pay1': {
        body: {
          id: 'pay1',
          purpose: 'MAP_LOCATION',
          status: 'SUCCESS',
          amount: 30,
          currency: 'AFGHANI',
          created_at: '2026-10-12T00:00:00Z',
        },
      },
    });
    const tree = await render(
      screenElement(CheckoutScreen, navigation(), route),
    );
    await settle();
    expect(allText(tree.root)).toContain(prs.checkout.mapItem);

    await press(tree.root, prs.checkout.pay);
    await settle();
    const post = callsTo(fetchMock).find(
      c => c.method === 'POST' && c.path === '/hesabpay/payments',
    );
    expect(post?.body).toEqual({ purpose: 'MAP_LOCATION' });
    expect(openUrl).toHaveBeenCalledWith('https://pay.example/x');
  });

  it('does not sell the add-on to an account that already pins for free', async () => {
    mockApi(fetchMock, {
      ...base,
      'GET /map-location/status': { body: STATUS_AGENCY },
    });
    const tree = await render(
      screenElement(CheckoutScreen, navigation(), route),
    );
    await settle();
    expect(allText(tree.root)).toContain(prs.map.alreadyUnlimited);
    expect(pressableWith(tree.root, prs.checkout.pay).props.disabled).toBe(
      true,
    );
  });
});

describe('HomeScreen: map view', () => {
  const page = (data: unknown[]) => ({
    data,
    meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
  });

  it('asks only for listings that have an exact pin when showing the map', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {
      'GET /properties': { body: page([listing({ lat: 34.5, lng: 69.1 })]) },
    });
    const tree = await render(screenElement(HomeScreen, navigation()));
    await settle();
    expect(
      callsTo(fetchMock).every(c => c.query.has_location === undefined),
    ).toBe(true); // list view: everything

    await press(tree.root, prs.home.map);
    await settle();
    const last = callsTo(fetchMock).at(-1)!;
    expect(last.query.has_location).toBe('true');
    expect(mapParts(tree.root, 'GeoJSONSource')).toHaveLength(1);
  });

  it('explains an empty map instead of showing the list message', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, { 'GET /properties': { body: page([]) } });
    const tree = await render(screenElement(HomeScreen, navigation()));
    await settle();
    await press(tree.root, prs.home.map);
    await settle();
    expect(allText(tree.root)).toContain(prs.home.noMapResults);
  });
});

describe('PropertyMap', () => {
  it('draws pinned listings only and reports which one was tapped', async () => {
    const pinned = listing({ id: 'a', lat: 34.5, lng: 69.1 });
    const unpinned = listing({ id: 'b' });
    const onSelect = jest.fn();
    const tree = await render(
      <PropertyMap
        properties={[pinned, unpinned] as never}
        camera={AFGHANISTAN_CAMERA}
        onSelect={onSelect}
      />,
    );
    const source = mapParts(tree.root, 'GeoJSONSource')[0];
    expect(source.props.data.features.map((f: { id: string }) => f.id)).toEqual(
      ['a'],
    );

    source.props.onPress({
      nativeEvent: { features: [{ properties: { id: 'a' } }] },
    });
    expect(onSelect).toHaveBeenCalledWith(pinned);
    source.props.onPress({
      nativeEvent: { features: [{ properties: { id: 'b' } }] },
    });
    source.props.onPress({ nativeEvent: { features: [] } });
    expect(onSelect).toHaveBeenCalledTimes(1); // an unpinned or unknown id is never selected
  });

  it('flies to a new view when the camera changes, but not on the first draw', async () => {
    const { __flyTo } = jest.requireMock('@maplibre/maplibre-react-native');
    __flyTo.mockClear();
    const props = { properties: [], onSelect: jest.fn() };
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

  it('credits OpenStreetMap on the map', async () => {
    const tree = await render(
      <PropertyMap
        properties={[]}
        camera={AFGHANISTAN_CAMERA}
        onSelect={jest.fn()}
      />,
    );
    expect(allText(tree.root)).toContain('© OpenStreetMap');
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
