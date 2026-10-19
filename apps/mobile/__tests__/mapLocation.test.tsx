import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { toLatinDigits } from '../src/i18n/format';
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
  ADDRESS_SYNC_DELAY_MS,
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
  addListener: jest.fn(() => () => undefined),
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
/** Picks a segmented-control option (a "tab"), not another button that happens to say the same word (the jerib ℹ). */
const pressTab = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    root
      .findAll(
        n =>
          n.props.accessibilityRole === 'tab' &&
          typeof n.props.onPress === 'function' &&
          allText(n).includes(label),
      )[0]
      .props.onPress();
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

const WRITTEN_ADDRESS = 'کابل، ناحیه ۵، پهلوی شفاخانه ABC، داخل کوچه موتررو';
/** One tap on the + of a stepper (it is found by its accessibility label, "تعداد اتاق: افزایش"). */
const plus = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    root
      .find(
        n =>
          typeof n.props.onPress === 'function' &&
          n.props.accessibilityLabel === `${label}: ${prs.common.increase}`,
      )
      .props.onPress();
  });
/** One tap on + for the bedrooms and the bathrooms: the form will not go without them. */
async function addRooms(root: ReactTestRenderer.ReactTestInstance) {
  await plus(root, prs.add.bedrooms);
  await plus(root, prs.add.bathrooms);
}
/** Fills in everything the form requires when there is no pin: the one written address included. */
async function fillForm(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.price, '1200000');
  await type(root, prs.add.area, '120');
  await addRooms(root);
  await type(root, prs.add.address, WRITTEN_ADDRESS);
  await press(root, prs.home.selectProvince); // opens the province list
  await press(root, 'کابل');
}
/** The same, up to and including the basics and the rooms, but no address at all: the pin is meant to supply it. */
async function fillBasics(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.price, '1200000');
  await type(root, prs.add.area, '120');
  await addRooms(root);
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

  it('asks for one address, with an example in it, instead of separate district and neighbourhood boxes', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    const field = inputLabelled(tree.root, prs.add.address);
    expect(field.props.placeholder).toBe(prs.add.addressPlaceholder);
    expect(field.props.multiline).toBe(true);
    // The old boxes ("ناحیه یا ولسوالی", "محله") are gone.
    expect(() => inputLabelled(tree.root, 'ناحیه یا ولسوالی')).toThrow();
    expect(() => inputLabelled(tree.root, 'محله')).toThrow();
  });

  it('will not send a house without its bedrooms and bathrooms, and marks both as required', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await type(tree.root, prs.add.titleField, 'آپارتمان سه‌خوابه');
    await type(tree.root, prs.add.price, '1200000');
    await type(tree.root, prs.add.area, '120');
    await type(tree.root, prs.add.address, WRITTEN_ADDRESS);
    await press(tree.root, prs.home.selectProvince);
    await press(tree.root, 'کابل');
    expect(allText(tree.root)).toMatch(
      new RegExp(`${prs.add.bedrooms}\\s+\\*`),
    );
    expect(allText(tree.root)).toMatch(
      new RegExp(`${prs.add.bathrooms}\\s+\\*`),
    );

    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeUndefined();
    // Both counts say so, each under its own tile.
    const text = allText(tree.root);
    expect(text.split(prs.add.required).length - 1).toBeGreaterThanOrEqual(2);

    await addRooms(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
  });

  it('does not ask for rooms on a plot of land', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await press(tree.root, prs.propertyType.LAND);
    expect(allText(tree.root)).not.toContain(prs.add.bedrooms);
    await type(tree.root, prs.add.titleField, 'زمین رهایشی');
    await type(tree.root, prs.add.price, '900000');
    await type(tree.root, prs.add.area, '300');
    await type(tree.root, prs.add.address, WRITTEN_ADDRESS);
    await press(tree.root, prs.home.selectProvince);
    await press(tree.root, 'کابل');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
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
      // What a field hands the screen always has plain 0-9; it is shown with Persian digits again.
      address: toLatinDigits(WRITTEN_ADDRESS),
      bedrooms: 1,
      bathrooms: 1,
    });
    // The district and neighbourhood are not asked for; a written address carries them in its own words.
    expect(posted()?.body.district ?? '').toBe('');
    expect(posted()?.body.neighborhood ?? '').toBe('');
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
    expect(mapParts(tree.root, 'ViewAnnotation')).toHaveLength(1);
    expect(allText(tree.root)).toContain(prs.add.addressOptional);
    await afterLookupDelay();

    expect(geocoderCalls()).toHaveLength(1);
    expect(String(geocoderCalls()[0][0])).toContain('lat=34.5');
    expect(String(geocoderCalls()[0][0])).toContain('lon=69.1');
    expect(allText(tree.root)).toContain(prs.add.filled);
    // One address field, written wide to narrow; the district and neighbourhood ride along unseen.
    expect(
      inputLabelled(tree.root, optional(prs.add.address)).props.value,
    ).toBe('ناحیه سوم، شهر نو، سرک چهارم');

    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({
      lat: 34.5,
      lng: 69.1, // latitude is the second map coordinate
      province: 'کابل',
      district: 'ناحیه سوم',
      neighborhood: 'شهر نو',
      address: 'ناحیه سوم، شهر نو، سرک چهارم',
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
    expect(mapParts(tree.root, 'ViewAnnotation')).toHaveLength(0);
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
      prs.propertyType.SHOP,
      prs.propertyType.OFFICE,
      prs.propertyType.LAND,
      prs.propertyType.GARDEN,
      prs.propertyType.VILLA,
      prs.propertyType.GARAGE,
      prs.propertyType.OTHER,
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
    // fillForm gave one of each; two more bedrooms and one more bathroom.
    await plus(tree.root, prs.add.bedrooms);
    await plus(tree.root, prs.add.bedrooms);
    await plus(tree.root, prs.add.bathrooms);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({ bedrooms: 3, bathrooms: 2 });
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

describe('AddPropertyScreen: a sliding sheet with friendly hints', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };
  const open = async (nav = navigation()) => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    return { tree, nav };
  };
  const wait = (ms: number) =>
    act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
    });
  const sheetOf = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAll(n => n.props.testID === 'bottom-sheet');
  const placeholderOf = (
    root: ReactTestRenderer.ReactTestInstance,
    label: string,
  ) => inputLabelled(root, label).props.placeholder as string;

  it('is a bottom sheet with a title and the main button pinned at its foot', async () => {
    const { tree } = await open();
    expect(sheetOf(tree.root).length).toBeGreaterThan(0);
    expect(allText(tree.root)).toContain(prs.nav.addProperty);
    expect(allText(tree.root)).toContain(prs.common.close);
    // The submit button is in the sheet's footer, not at the end of the scrolling form.
    const footer = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        StyleSheet.flatten(n.props.style)?.borderTopWidth === 1 &&
        allText(n).includes(prs.add.submit),
    );
    expect(footer.length).toBeGreaterThan(0);
  });

  it('closes by sliding away first and only then leaves the route', async () => {
    const { tree, nav } = await open();
    await press(tree.root, prs.common.close);
    expect(nav.goBack).not.toHaveBeenCalled();
    await wait(600);
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('slides away before sending a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree, nav } = await open();
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).not.toHaveBeenCalled();
    await wait(600);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it('slides back up, with the form as it was, when the screen it stepped aside for is closed', async () => {
    mockAuth = { status: 'signedOut', user: null };
    let focus: (() => void) | undefined;
    const nav = navigation();
    nav.addListener.mockImplementation(((event: string, cb: () => void) => {
      if (event === 'focus') focus = cb;
      return () => undefined;
    }) as never);
    const { tree } = await open(nav);
    await press(tree.root, prs.auth.signIn);
    await wait(600);
    expect(sheetOf(tree.root)).toHaveLength(0);
    await act(async () => focus?.());
    await settle();
    expect(sheetOf(tree.root).length).toBeGreaterThan(0);
  });

  it('gives the shop, office, garden, villa, garage and other each a chip of its own, not a grouped one', async () => {
    const { tree } = await open();
    for (const kind of [
      'SHOP',
      'OFFICE',
      'GARDEN',
      'VILLA',
      'GARAGE',
      'OTHER',
    ] as const) {
      const chip = tree.root.findAll(
        n =>
          n.props.accessibilityRole === 'button' &&
          typeof n.props.onPress === 'function' &&
          allText(n).trim() === prs.propertyType[kind],
      );
      expect(chip.length).toBeGreaterThan(0);
    }
    // No label joins two kinds into one chip any more.
    expect(allText(tree.root)).not.toMatch(
      /دکان و دفتر|باغ و ویلا|گاراج و غیره/,
    );
  });

  it('changes the title hint with the kind of property chosen', async () => {
    const { tree } = await open();
    // A house is the first choice.
    expect(placeholderOf(tree.root, prs.add.titleField)).toBe(
      'خانه سه خوابه در شهر نو',
    );
    const seen = new Set<string>();
    for (const kind of [
      'APARTMENT',
      'SHOP',
      'OFFICE',
      'LAND',
      'GARDEN',
      'VILLA',
      'GARAGE',
      'OTHER',
      'HOUSE_HAWILI',
    ] as const) {
      await press(tree.root, prs.propertyType[kind]);
      const hint = placeholderOf(tree.root, prs.add.titleField);
      expect(hint).toBe(prs.add.titleExamples[kind]);
      seen.add(hint);
    }
    expect(seen.size).toBe(9); // each kind has its own
  });

  it('gives every box a friendly hint, with an example figure rather than a bare zero', async () => {
    const { tree } = await open();
    const { root } = tree;
    for (const label of [
      prs.add.titleField,
      prs.add.price,
      prs.add.area,
      prs.add.descriptionField,
    ]) {
      expect(placeholderOf(root, label)).toBeTruthy();
    }
    expect(placeholderOf(root, prs.add.price)).toBe('۲,۵۰۰,۰۰۰');
    expect(placeholderOf(root, prs.add.area)).toBe('۲۰۰');
    expect(placeholderOf(root, prs.add.descriptionField)).toBe(
      prs.add.descriptionPlaceholder,
    );
    expect(placeholderOf(root, prs.add.address)).toBe(
      prs.add.addressPlaceholder,
    );
    for (const input of root.findAllByType(TextInput)) {
      expect(String(input.props.placeholder ?? '')).not.toBe('۰');
      expect(String(input.props.placeholder ?? '')).not.toBe('0');
    }
  });

  it('shows a dollar example once dollars are chosen, and a jerib example for jerib', async () => {
    const { tree } = await open();
    await press(tree.root, prs.currency.USD);
    expect(placeholderOf(tree.root, prs.add.price)).toBe('۲۵,۰۰۰');
    await pressTab(tree.root, prs.unit.jerib);
    expect(placeholderOf(tree.root, prs.add.area)).toBe('۲');
  });

  it('has the jerib info next to the area, with this area worked out', async () => {
    const { tree } = await open();
    await type(tree.root, prs.add.area, '1000');
    await act(async () => {
      tree.root
        .findAll(n => n.props.testID === 'jerib-info')
        .find(n => typeof n.props.onPress === 'function')!
        .props.onPress();
    });
    expect(allText(tree.root)).toContain(prs.property.jeribInfoTitle);
    expect(allText(tree.root)).toContain('۱,۰۰۰ متر مربع، یعنی حدود ۰٫۵ جریب');
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
    expect(mapParts(tree.root, 'ViewAnnotation')).toHaveLength(1); // the existing pin
    expect(allText(tree.root)).toContain(prs.add.save);
    expect(allText(tree.root)).toContain(prs.add.editTitle); // the sheet's own title
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
    // The sheet slides away first, and only then does the route close.
    expect(nav.goBack).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
    });
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

describe('PropertyDetailsScreen: a listing with no description', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const route = { params: { id } };
  const SENTENCE = 'توضیحات تکمیلی برای این ملک ثبت نشده است.';
  const show = async (description: unknown) => {
    mockApi(fetchMock, {
      [`GET /properties/${id}`]: { body: listing({ description }) },
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    return tree;
  };
  const placeholder = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAll(
      n => n.props.testID === 'no-description' && typeof n.type === 'string',
    );

  it('says so politely when the description is empty, missing or only spaces', async () => {
    expect(prs.property.noDescription).toBe(SENTENCE);
    for (const description of ['', '   ', '\n \t', null, undefined]) {
      const tree = await show(description);
      expect(allText(tree.root)).toContain(prs.property.description);
      expect(placeholder(tree.root)).toHaveLength(1);
      expect(placeholder(tree.root)[0].props.children).toBe(SENTENCE);
      ReactTestRenderer.act(() => tree.unmount());
    }
  });

  it("shows the owner's own words, and no placeholder, when there are some", async () => {
    const tree = await show('دو طبقه است و آب و برق دارد.');
    expect(allText(tree.root)).toContain('دو طبقه است و آب و برق دارد.');
    expect(placeholder(tree.root)).toHaveLength(0);
    expect(allText(tree.root)).not.toContain(SENTENCE);
  });
});

// ─────────── Round 4: the unit, and the form and the map following each other ───────────

describe('AddPropertyScreen: the unit of the property', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };
  const open = async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    return tree;
  };
  const unitLabel = optional(prs.add.unit);

  it('is one optional free-text box, with no sub-category chips', async () => {
    const tree = await open();
    const box = inputLabelled(tree.root, unitLabel);
    expect(box.props.value ?? '').toBe('');
    expect(box.props.placeholder).toBe(prs.add.unitPlaceholder);
    // The old chips (حویلی, دوپلکس, تاون‌هاوس…) are gone.
    expect(
      tree.root.findAll(n => n.props.testID === 'unit-chips'),
    ).toHaveLength(0);
    const text = allText(tree.root);
    for (const old of ['دوپلکس', 'تاون‌هاوس']) expect(text).not.toContain(old);
  });

  it('sends what was written, trimmed', async () => {
    const tree = await open();
    await fillForm(tree.root);
    await type(tree.root, unitLabel, '  واحد ۳ ');
    await press(tree.root, prs.add.submit);
    await settle();
    // Like every box in the form, it hands the screen plain 0-9; the screens that show it draw them as ۰-۹.
    expect(posted()?.body).toMatchObject({
      type: 'HOUSE_HAWILI',
      unit: 'واحد 3',
    });
    expect(posted()?.body).not.toHaveProperty('unit_type');
  });

  it('sends no unit (null) when the box is left empty or blank', async () => {
    const tree = await open();
    await fillForm(tree.root);
    await type(tree.root, unitLabel, '   ');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body.unit ?? null).toBeNull();
  });

  it('keeps what was written when the type is changed', async () => {
    const tree = await open();
    await type(tree.root, unitLabel, 'واحد ۳');
    await press(tree.root, prs.propertyType.APARTMENT);
    expect(inputLabelled(tree.root, unitLabel).props.value).toBe('واحد ۳');
  });
});

describe('AddPropertyScreen: the form moves the map', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };
  const SEARCH = 'https://nominatim.openstreetmap.org/search';
  const flyTo = () =>
    jest.requireMock('@maplibre/maplibre-react-native').__flyTo as jest.Mock;
  const searches = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith(SEARCH));
  const afterSyncDelay = () =>
    act(async () => {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), ADDRESS_SYNC_DELAY_MS + 80),
      );
    });

  /** The geocoder answering a written address (search) as well as a pin (reverse). */
  const answer = (search: unknown | 'down') => {
    answerGeocoder(KABUL_SPOT, routes);
    const inner = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith(SEARCH)) {
        if (search === 'down') throw new Error('offline');
        return { ok: true, status: 200, json: async () => search };
      }
      return inner(url, init);
    });
  };
  const HERAT = [
    {
      lat: '34.34',
      lon: '62.2',
      boundingbox: ['34.30', '34.38', '62.15', '62.25'],
    },
  ];

  beforeEach(() => flyTo().mockClear());

  it('flies to the written address, asking about it together with the province', async () => {
    answer(HERAT);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await press(tree.root, prs.home.selectProvince);
    await press(tree.root, 'هرات');
    flyTo().mockClear();

    await type(tree.root, prs.add.address, 'پوهنتون جامی');
    expect(searches()).toHaveLength(0); // it waits for the typing to stop
    await afterSyncDelay();

    expect(searches()).toHaveLength(1);
    const url = decodeURIComponent(String(searches()[0][0]));
    expect(url).toContain('پوهنتون جامی');
    expect(url).toContain('هرات');
    expect(url).toContain('countrycodes=af');
    expect(flyTo()).toHaveBeenCalledWith(
      expect.objectContaining({ center: [62.2, 34.34] }),
    );
    expect(allText(tree.root)).toContain(prs.add.mapFound);
  });

  it('asks once for a burst of typing, about the last text', async () => {
    answer(HERAT);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await type(tree.root, prs.add.address, 'هرات');
    await type(tree.root, prs.add.address, 'هرات، جاده');
    await type(tree.root, prs.add.address, 'هرات، جاده ملک');
    await afterSyncDelay();
    expect(searches()).toHaveLength(1);
    expect(decodeURIComponent(String(searches()[0][0]))).toContain(
      'هرات، جاده ملک',
    );
  });

  it('flies to a province as soon as one is chosen, without any service', async () => {
    answer(HERAT);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await press(tree.root, prs.home.selectProvince);
    await press(tree.root, 'هرات');
    expect(flyTo()).toHaveBeenCalled();
    expect(searches()).toHaveLength(0);
  });

  it('says so when the address is not on the map, and keeps what was typed', async () => {
    answer([]);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await type(tree.root, prs.add.address, 'جایی که نیست');
    await afterSyncDelay();
    expect(allText(tree.root)).toContain(prs.add.mapNotFound);
    expect(inputLabelled(tree.root, prs.add.address).props.value).toBeTruthy();
    expect(flyTo()).not.toHaveBeenCalled();
  });

  it('stays quiet and keeps working when the address service is down', async () => {
    answer('down');
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await type(tree.root, prs.add.address, 'کابل، شهر نو');
    await afterSyncDelay();
    expect(flyTo()).not.toHaveBeenCalled();
    expect(allText(tree.root)).not.toContain(prs.add.mapNotFound);
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
  });

  it('does not chase the address a pin has just written (no loop)', async () => {
    answer(HERAT);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    expect(
      inputLabelled(tree.root, optional(prs.add.address)).props.value,
    ).toBe('ناحیه سوم، شهر نو، سرک چهارم');
    await afterSyncDelay();
    expect(searches()).toHaveLength(0);
  });

  it('follows the person again once they edit the address a pin wrote', async () => {
    answer(HERAT);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    await type(
      tree.root,
      optional(prs.add.address),
      'ناحیه سوم، شهر نو، سرک پنجم',
    );
    await afterSyncDelay();
    expect(searches()).toHaveLength(1);
  });
});

describe('AddPropertyScreen: the map fills the form', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };
  const annotation = (root: ReactTestRenderer.ReactTestInstance) =>
    mapParts(root, 'ViewAnnotation')[0];
  const drop = (
    root: ReactTestRenderer.ReactTestInstance,
    lngLat: [number, number],
  ) =>
    act(async () => {
      annotation(root).props.onDragEnd({ nativeEvent: { lngLat } });
    });

  it('makes the pin draggable, and fills province and address from where it is dropped', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.0, 34.4]),
    );
    await afterLookupDelay();
    expect(annotation(tree.root).props.draggable).toBe(true);
    const asked = geocoderCalls().length;

    await drop(tree.root, [69.1, 34.5]);
    await afterLookupDelay();
    expect(geocoderCalls().length).toBe(asked + 1);
    expect(String(geocoderCalls().at(-1)![0])).toContain('lat=34.5');
    expect(String(geocoderCalls().at(-1)![0])).toContain('lon=69.1');
    expect(
      inputLabelled(tree.root, optional(prs.add.address)).props.value,
    ).toBe('ناحیه سوم، شهر نو، سرک چهارم');

    await fillBasicsOnly(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({
      lat: 34.5,
      lng: 69.1,
      province: 'کابل',
    });
  });

  it('refuses a drop outside Afghanistan, says so, and keeps the earlier point', async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    const asked = geocoderCalls().length;
    await drop(tree.root, [-0.12, 51.5]);
    await afterLookupDelay();
    expect(allText(tree.root)).toContain(prs.map.outside);
    expect(geocoderCalls().length).toBe(asked);
    expect(annotation(tree.root).props.lngLat).toEqual([69.1, 34.5]);
  });

  it('says the address could not be found, instead of staying silent, when the service is down', async () => {
    answerGeocoder('down', routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () =>
      tapMap(tree.root, 'location-picker-map', [69.1, 34.5]),
    );
    await afterLookupDelay();
    expect(allText(tree.root)).toContain(prs.add.lookupFailed);
  });
});

/** Title, price, area and rooms: what the form needs besides where the property is. */
async function fillBasicsOnly(root: ReactTestRenderer.ReactTestInstance) {
  await fillBasics(root);
}
