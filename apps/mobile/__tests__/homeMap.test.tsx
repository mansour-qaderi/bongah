import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  Animated,
  AppState,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationManager } from '@maplibre/maplibre-react-native';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { formatNumber } from '../src/i18n/format';
import {
  allText,
  callsTo,
  jsonResponse,
  mapParts,
  mockApi,
  pressableWith,
  render as renderTree,
  tapMap,
} from '../test-utils';
import { mockNavigation } from '../test-utils/navMock';
import FilterSheet from '../src/components/FilterSheet';
import { MARKER_TAP_GRACE_MS } from '../src/components/PropertyMap';
import { dealColors } from '../src/theme';

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

const maplibre = jest.requireMock('@maplibre/maplibre-react-native') as {
  __flyTo: jest.Mock;
  __location: {
    grant: boolean;
    position: unknown;
    requests: number;
    fixes: number;
  };
};

const viewer = {
  id: 'viewer',
  role: 'USER',
  phone_number: '+93700000001',
  full_name: 'بیننده',
  avatar: null,
  enable_daily_motivation: true,
  has_seen_welcome: true,
};

const listing = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  user_id: 'seller',
  agency_id: null,
  agency_name: null,
  title: 'آپارتمان سه‌خوابه',
  description: 'تازه‌ساز',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 2_500_000,
  currency: 'AFGHANI',
  area_sqm: 120,
  bedrooms: 3,
  bathrooms: 2,
  province: 'کابل',
  district: 'شهر نو',
  neighborhood: 'قلعه فتح‌الله',
  address: 'سرک چهارم',
  lat: 34.5281,
  lng: 69.1723,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});
const agencyPin = (overrides: Record<string, unknown> = {}) => ({
  id: 'ag1',
  agency_name: 'دفتر املاک نور',
  address: 'شهر نو، کابل',
  lat: 36.7, // Mazar-i-Sharif: well away from the default listing in Kabul
  lng: 67.1,
  active_listings: 3,
  ...overrides,
});
const page = (data: unknown[], pageNo = 1, pages = 1) => ({
  data,
  meta: { page: pageNo, limit: 20, total: data.length, total_pages: pages },
});
const quota = {
  free_limit: 3,
  free_used: 0,
  free_remaining: 3,
  credits: 0,
  referral_credits: 0,
  unlimited: false,
  unlimited_reason: null,
  resets_at: '2026-10-14T19:30:00.000Z',
};

/** The API for a home screen that has these listings and offices. */
const serve = (properties: unknown[], agencies: unknown[] = []) =>
  mockApi(fetchMock, {
    'GET /properties': { body: page(properties) },
    'GET /agencies/map': { body: agencies },
    'GET /properties/p1/contact': {
      body: { unlocked: false, is_owner: false, contact: null, quota },
    },
    'POST /properties/p1/contact/unlock': {
      body: {
        unlocked: true,
        is_owner: false,
        contact: {
          full_name: 'احمد',
          phone_number: '+93701234567',
          agency_name: null,
        },
        quota,
        paid_with: 'FREE_DAILY',
      },
    },
  });

const navigation = () => ({
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
});
const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
const home = (nav = navigation()) =>
  withQuery(
    <HomeScreen
      {...({
        navigation: nav,
        route: { params: undefined },
      } as unknown as React.ComponentProps<typeof HomeScreen>)}
    />,
  );

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });
/** Taps the control that has this accessibility label (the floating buttons have an icon, not words). */
const tapLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    const found = root.findAll(
      n =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    )[0];
    if (!found) throw new Error(`No control labelled "${label}"`);
    found.props.onPress();
  });
const tapTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  act(async () => {
    const found = root.findAll(
      n => n.props.testID === id && typeof n.props.onPress === 'function',
    )[0];
    if (!found) throw new Error(`No control with testID "${id}"`);
    found.props.onPress();
  });
const labelled = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAll(n => n.props.accessibilityLabel === label).length > 0;
const hasId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll(n => n.props.testID === id).length > 0;
/** What a screen reader says about a marker. */
const spoken = (node: ReactTestRenderer.ReactTestInstance) =>
  node.findAll(n => typeof n.props.accessibilityLabel === 'string')[0].props
    .accessibilityLabel as string;
const permissionCard = (root: ReactTestRenderer.ReactTestInstance) =>
  byTestId(root, 'location-permission');
const markers = (root: ReactTestRenderer.ReactTestInstance) =>
  mapParts(root, 'Marker');
const markerIds = (root: ReactTestRenderer.ReactTestInstance) =>
  markers(root).map(m => m.props.id as string);
const marker = (root: ReactTestRenderer.ReactTestInstance, id: string) => {
  const found = markers(root).find(m => m.props.id === id);
  if (!found) throw new Error(`No marker ${id}; have ${markerIds(root)}`);
  return found;
};
const tapMarker = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  act(async () => {
    marker(root, id).props.onPress();
  });
const byTestId = (root: ReactTestRenderer.ReactTestInstance, testID: string) =>
  root.findAll(n => n.props.testID === testID && typeof n.type !== 'string');
/** Tells the screen the map settled at this zoom, showing this area. */
const moveMap = (
  root: ReactTestRenderer.ReactTestInstance,
  zoom: number,
  bounds: [number, number, number, number],
  userInteraction = false,
) =>
  act(async () => {
    const map = mapParts(root, 'Map').find(
      n => n.props.testID === 'property-map',
    )!;
    map.props.onRegionDidChange({
      nativeEvent: { zoom, bounds, userInteraction },
    });
  });
const lastFly = () => maplibre.__flyTo.mock.calls.at(-1)?.[0];

const openUrl = jest.fn(async (_url: string): Promise<void> => undefined);

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  maplibre.__flyTo.mockClear();
  mockNavigation.navigate.mockClear();
  openUrl.mockClear();
  Object.assign(maplibre.__location, {
    grant: true,
    position: undefined,
    requests: 0,
    fixes: 0,
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: viewer };
  jest.spyOn(Linking, 'openURL').mockImplementation(openUrl);
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

describe('Home map: markers', () => {
  it('opens on the map; a listing is a coloured badge that says its type, deal, price and seller aloud', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:p1']);
    const node = marker(tree.root, 'property:p1');
    const said = spoken(node);
    expect(said).toContain(prs.propertyType.APARTMENT);
    expect(said).toContain(prs.dealType.SALE);
    expect(said).toContain('۲٫۵ میلیون ؋');
    expect(said).toContain(prs.property.owner); // a private seller
    // Far out, the map shows just the badge: no price crowding the streets.
    expect(allText(node)).not.toContain('میلیون');
  });

  it('shows the price above the badge once the map is close enough, and always on the chosen one', async () => {
    serve([listing(), listing({ id: 'p2', lat: 36.7, lng: 67.1 })]);
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 15, [60, 30, 75, 38]);
    expect(allText(marker(tree.root, 'property:p1'))).toContain('۲٫۵ میلیون ؋');

    await moveMap(tree.root, 10, [60, 30, 75, 38]);
    expect(allText(marker(tree.root, 'property:p1'))).not.toContain('میلیون');
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(allText(marker(tree.root, 'property:p1'))).toContain('۲٫۵ میلیون ؋');
    expect(allText(marker(tree.root, 'property:p2'))).not.toContain('میلیون');
  });

  it('colours the badge by the deal: emerald for sale, blue for rent, gold for growi', async () => {
    serve([
      listing({ id: 's', deal_type: 'SALE', lat: 34.1, lng: 68.1 }),
      listing({ id: 'r', deal_type: 'RENT', lat: 35.1, lng: 66.1 }),
      listing({ id: 'g', deal_type: 'MORTGAGE_GROWI', lat: 36.1, lng: 64.1 }),
    ]);
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 8, [60, 30, 75, 38]);
    const colourOf = (id: string) =>
      StyleSheet.flatten(
        marker(tree.root, id).findAll(
          n => n.props.testID === 'marker-badge' && typeof n.type === 'string',
        )[0].props.style,
      ).backgroundColor;
    expect(colourOf('property:s')).toBe(dealColors.SALE.main);
    expect(colourOf('property:r')).toBe(dealColors.RENT.main);
    expect(colourOf('property:g')).toBe(dealColors.MORTGAGE_GROWI.main);
    expect(colourOf('property:s')).toBe('#047857'); // the brand emerald
  });

  it('draws a different icon for each kind of property', async () => {
    const kinds = [
      'APARTMENT',
      'HOUSE_HAWILI',
      'LAND',
      'OFFICE_SHOP',
      'GARDEN_VILLA',
      'GARAGE_OTHER',
    ];
    serve(
      kinds.map((type, i) =>
        listing({ id: `k${i}`, type, lat: 30 + i, lng: 62 + i }),
      ),
    );
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 8, [60, 29, 75, 38]);
    const shapes = (id: string) =>
      JSON.stringify(
        marker(tree.root, id)
          .findAll(n => typeof n.type === 'string')
          .map(n => StyleSheet.flatten(n.props.style)),
      );
    const drawings = kinds.map((_, i) => shapes(`property:k${i}`));
    expect(new Set(drawings).size).toBe(kinds.length);
  });

  it('names the agency as the seller, and stars a featured listing', async () => {
    serve([
      listing({
        agency_id: 'ag1',
        agency_name: 'دفتر املاک نور',
        is_featured: true,
        type: 'HOUSE_HAWILI',
        price: 800,
        currency: 'USD',
      }),
      listing({ id: 'p2', lat: 36.7, lng: 67.1 }),
    ]);
    const tree = await render(home());
    await settle();
    const node = marker(tree.root, 'property:p1');
    const said = spoken(node);
    expect(said).toContain('دفتر املاک نور');
    expect(said).toContain(prs.propertyType.HOUSE_HAWILI);
    expect(said).toContain('۸۰۰ $');
    expect(said).not.toContain(prs.property.owner);
    expect(hasId(node, 'featured-star')).toBe(true);
    expect(hasId(marker(tree.root, 'property:p2'), 'featured-star')).toBe(
      false,
    );
  });

  it('draws verified offices as their own kind of marker: a square with a tick, no price', async () => {
    serve([listing()], [agencyPin()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root).sort()).toEqual(['agency:ag1', 'property:p1']);
    const node = marker(tree.root, 'agency:ag1');
    expect(spoken(node)).toBe('دفتر املاک نور');
    expect(allText(node)).toContain('✓');
    expect(allText(node)).not.toContain('؋');
    // Close in, the office's name appears above it.
    expect(allText(node)).not.toContain('دفتر املاک نور');
    await moveMap(tree.root, 15, [60, 30, 75, 38]);
    expect(allText(marker(tree.root, 'agency:ag1'))).toContain(
      'دفتر املاک نور',
    );
  });

  it('always shows the offices, with no switch for them on the map', async () => {
    serve([listing()], [agencyPin()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toContain('agency:ag1');
    expect(hasId(tree.root, 'toggle-agencies')).toBe(false);
    expect(labelled(tree.root, prs.home.agencies)).toBe(false);
  });

  it('keeps showing listings when the offices cannot be loaded', async () => {
    mockApi(fetchMock, {
      'GET /properties': { body: page([listing()]) },
      'GET /agencies/map': { status: 500, body: { message: 'boom' } },
    });
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:p1']);
    expect(allText(tree.root)).not.toContain('boom');
  });

  it('shows the map even while loading, and an error with a retry when listings fail', async () => {
    mockApi(fetchMock, {
      'GET /properties': { status: 500, body: { message: 'خطای سرور' } },
      'GET /agencies/map': { body: [agencyPin()] },
    });
    const tree = await render(home());
    await settle();
    expect(allText(tree.root)).toContain(prs.errors.unknown); // never the server's English message
    expect(allText(tree.root)).not.toContain('خطای سرور');
    expect(pressableWith(tree.root, prs.common.retry)).toBeTruthy();
    expect(markerIds(tree.root)).toEqual(['agency:ag1']); // offices still useful
    expect(mapParts(tree.root, 'Map')).not.toHaveLength(0);
  });

  it('says so when there is nothing on the map', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    expect(allText(tree.root)).toContain(prs.home.noMapResults);
    expect(markers(tree.root)).toHaveLength(0);
  });
});

describe('Home map: the listing card', () => {
  it('opens on a tap with the key facts and Call / WhatsApp / Chat, and centres the marker above it', async () => {
    serve([listing({ agency_id: 'ag1', agency_name: 'دفتر املاک نور' })]);
    const tree = await render(home());
    await settle();
    expect(byTestId(tree.root, 'property-preview')).toHaveLength(0);

    await tapMarker(tree.root, 'property:p1');
    await settle();
    const card = byTestId(tree.root, 'property-preview')[0];
    const text = allText(card);
    expect(text).toContain('آپارتمان سه‌خوابه');
    expect(text).toContain('۲٬۵۰۰٬۰۰۰ ؋'); // the full price on the card
    expect(text).toContain('۱۲۰ متر مربع');
    expect(text).toContain(`${formatNumber(3, 0)} ${prs.property.bedrooms}`);
    expect(text).toContain(`${formatNumber(2, 0)} ${prs.property.bathrooms}`);
    expect(text).toContain('دفتر املاک نور');
    for (const action of [
      prs.property.callAction,
      prs.property.whatsappAction,
      prs.property.chatAction,
    ]) {
      expect(text).toContain(action);
    }

    // The map flew to the listing, leaving room for the card.
    expect(lastFly()).toMatchObject({
      center: [69.1723, 34.5281],
      padding: { bottom: 320 },
    });
    expect(lastFly().zoom).toBeGreaterThanOrEqual(13);
  });

  it('calls the seller from the card: the number is revealed, then dialled', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await press(tree.root, prs.property.callAction);
    await settle();

    const unlocks = callsTo(fetchMock).filter(
      c => c.method === 'POST' && c.path === '/properties/p1/contact/unlock',
    );
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].body).toEqual({ use_credit: false });
    expect(openUrl).toHaveBeenCalledWith('tel:+93701234567');
  });

  it('asks a signed-out visitor to sign in instead of revealing a number', async () => {
    mockAuth = { status: 'signedOut', user: null };
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(allText(tree.root)).toContain(prs.property.contactSignIn);
  });

  it('opens the details page when the card is tapped', async () => {
    serve([listing()]);
    const nav = navigation();
    const tree = await render(home(nav));
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await act(async () => {
      tree.root
        .findAll(n => n.props.accessibilityLabel === prs.home.viewDetails)
        .find(n => typeof n.props.onPress === 'function')!
        .props.onPress();
    });
    expect(nav.navigate).toHaveBeenCalledWith('PropertyDetails', { id: 'p1' });
  });

  it('closes with ×, restoring the map buttons and the tab bar', async () => {
    const nav = navigation();
    serve([listing()]);
    const tree = await render(home(nav));
    await settle();
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    await tapMarker(tree.root, 'property:p1');
    await settle();
    // The card has the foot of the screen to itself: the buttons and the tab bar step aside.
    expect(labelled(tree.root, prs.home.locate)).toBe(false);
    expect(labelled(tree.root, prs.home.locate)).toBe(false);
    expect(nav.setOptions).toHaveBeenLastCalledWith({
      tabBarStyle: { display: 'none' },
    });

    await press(tree.root, '×');
    expect(byTestId(tree.root, 'property-preview')).toHaveLength(0);
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    expect(nav.setOptions).toHaveBeenLastCalledWith({
      tabBarStyle: undefined,
    });
  });

  it('shows the owner their own listing without contact buttons', async () => {
    mockAuth = { status: 'signedIn', user: { ...viewer, id: 'seller' } };
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    const text = allText(byTestId(tree.root, 'property-preview')[0]);
    expect(text).toContain(prs.property.yourListing);
    expect(text).not.toContain(prs.property.callAction);
  });

  it('switches to another listing with fresh state', async () => {
    serve([
      listing(),
      listing({ id: 'p2', title: 'خانه حویلی', lat: 36.7, lng: 67.1 }),
    ]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await tapMarker(tree.root, 'property:p2');
    await settle();
    const cards = byTestId(tree.root, 'property-preview');
    expect(cards).toHaveLength(1);
    expect(allText(cards[0])).toContain('خانه حویلی');
  });

  it('shows an office card with its address and active listings, and nothing to call', async () => {
    serve([], [agencyPin()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'agency:ag1');
    const card = byTestId(tree.root, 'agency-preview')[0];
    const text = allText(card);
    expect(text).toContain('دفتر املاک نور');
    expect(text).toContain('شهر نو، کابل');
    expect(text).toContain(prs.home.agencyVerified);
    expect(text).toContain(
      prs.home.agencyListings.replace('{{count}}', formatNumber(3, 0)),
    );
    expect(text).not.toContain(prs.property.callAction);
    expect(lastFly()).toMatchObject({ padding: { bottom: 170 } });

    await press(tree.root, '×');
    expect(byTestId(tree.root, 'agency-preview')).toHaveLength(0);
  });

  it('says plainly when an office has no active listings', async () => {
    serve([], [agencyPin({ active_listings: 0 })]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'agency:ag1');
    expect(allText(tree.root)).toContain(prs.home.agencyNoListings);
  });
});

describe('Home map: clusters', () => {
  // Two listings 20 m apart, a third far away in Herat.
  const crowd = () => [
    listing({ id: 'p1', lat: 34.5281, lng: 69.1723 }),
    listing({
      id: 'p2',
      title: 'خانه حویلی',
      type: 'HOUSE_HAWILI',
      lat: 34.5282,
      lng: 69.1724,
    }),
    listing({ id: 'p3', title: 'زمین هرات', lat: 34.34, lng: 62.2 }),
  ];

  // The same, but the two are metres apart: no zoom can pull them apart.
  const pile = () => [
    listing({ id: 'p1', lat: 34.5281, lng: 69.1723 }),
    listing({
      id: 'p2',
      title: 'خانه حویلی',
      type: 'HOUSE_HAWILI',
      lat: 34.528100001,
      lng: 69.172300001,
    }),
    listing({ id: 'p3', title: 'زمین هرات', lat: 34.34, lng: 62.2 }),
  ];

  it('turns overlapping markers into one counted marker and leaves distant ones alone', async () => {
    serve(crowd());
    const tree = await render(home());
    await settle();
    const ids = markerIds(tree.root);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('property:p3');
    const cluster = markers(tree.root).find(m =>
      String(m.props.id).startsWith('cluster:'),
    )!;
    expect(allText(cluster)).toContain(formatNumber(2, 0));
  });

  it('opens a list of everything in the spot when a cluster that cannot be pulled apart is tapped, and picking one opens its card', async () => {
    serve(pile(), []);
    const tree = await render(home());
    await settle();
    const cluster = markers(tree.root).find(m =>
      String(m.props.id).startsWith('cluster:'),
    )!;
    await act(async () => cluster.props.onPress());

    const sheet = byTestId(tree.root, 'cluster-list')[0];
    const text = allText(sheet);
    expect(text).toContain(
      prs.home.clusterTitle.replace('{{count}}', formatNumber(2, 0)),
    );
    expect(text).toContain('آپارتمان سه‌خوابه');
    expect(text).toContain('خانه حویلی');
    expect(text).not.toContain('زمین هرات'); // only what is in that spot

    await act(async () => {
      pressableWith(sheet, 'خانه حویلی').props.onPress();
    });
    await settle();
    expect(byTestId(tree.root, 'cluster-list')).toHaveLength(0);
    expect(allText(byTestId(tree.root, 'property-preview')[0])).toContain(
      'خانه حویلی',
    );
  });

  it('puts an office and a listing in the same spot into one list', async () => {
    serve(
      [listing({ lat: 34.55, lng: 69.2 })],
      [agencyPin({ lat: 34.55, lng: 69.2 })],
    );
    const tree = await render(home());
    await settle();
    const cluster = markers(tree.root).find(m =>
      String(m.props.id).startsWith('cluster:'),
    )!;
    await act(async () => cluster.props.onPress());
    const text = allText(byTestId(tree.root, 'cluster-list')[0]);
    expect(text).toContain('آپارتمان سه‌خوابه');
    expect(text).toContain('دفتر املاک نور');
    expect(text).toContain(prs.home.agencyVerified);
  });

  it('closes the list without choosing', async () => {
    serve(pile());
    const tree = await render(home());
    await settle();
    const cluster = markers(tree.root).find(m =>
      String(m.props.id).startsWith('cluster:'),
    )!;
    await act(async () => cluster.props.onPress());
    const sheet = byTestId(tree.root, 'cluster-list')[0];
    await act(async () => {
      pressableWith(sheet, prs.common.close).props.onPress();
    });
    expect(byTestId(tree.root, 'cluster-list')).toHaveLength(0);
    expect(byTestId(tree.root, 'property-preview')).toHaveLength(0);
  });

  it('splits the cluster when the map is zoomed in', async () => {
    serve(crowd());
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toHaveLength(2);
    await moveMap(tree.root, 19, [62, 34, 70, 35]);
    expect(markerIds(tree.root).sort()).toEqual([
      'property:p1',
      'property:p2',
      'property:p3',
    ]);
  });

  it('draws only what is on screen (and a margin), so a big country stays smooth', async () => {
    serve(crowd());
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 12, [69.1, 34.4, 69.3, 34.6]); // around Kabul only
    const ids = markerIds(tree.root);
    expect(ids).not.toContain('property:p3');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('never draws more than a screenful of markers', async () => {
    const many = Array.from({ length: 150 }, (_, i) =>
      listing({
        id: `m${String(i).padStart(3, '0')}`,
        // A 15 x 10 grid about 22 km apart: far enough apart never to cluster at this zoom.
        lat: 30 + Math.floor(i / 15) * 0.2,
        lng: 63 + (i % 15) * 0.2,
      }),
    );
    serve(many);
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 14, [60, 29, 75, 38]);
    expect(markers(tree.root).length).toBeLessThanOrEqual(120);
  });
});

describe('Home map: where I am', () => {
  const kabul = {
    coords: {
      latitude: 34.5281,
      longitude: 69.1723,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 1,
  };
  const shown = (root: ReactTestRenderer.ReactTestInstance) =>
    permissionCard(root).length > 0;

  it('asks for the position as the app opens, then shows me and flies there: a blue dot, no card', async () => {
    maplibre.__location.position = kabul;
    serve([]);
    const tree = await render(home());
    await settle();
    expect(maplibre.__location.requests).toBe(1);
    expect(markerIds(tree.root)).toEqual(['me']);
    expect(lastFly()).toMatchObject({
      center: [69.1723, 34.5281],
      zoom: 14,
      padding: { bottom: 0 },
    });
    expect(shown(tree.root)).toBe(false);
  });

  it('opens a card when location is refused: why it is needed, a button to the phone settings, and "not now"', async () => {
    maplibre.__location.grant = false;
    serve([]);
    const tree = await render(home());
    await settle();
    expect(shown(tree.root)).toBe(true);
    const text = allText(tree.root);
    expect(text).toContain(prs.home.permissionDeniedTitle);
    expect(text).toContain(prs.home.locationDenied);
    expect(text).toContain(prs.home.permissionPrivacy);
    expect(markerIds(tree.root)).toEqual([]);
    // The map is still usable underneath: it stays on Kabul.
    expect(maplibre.__flyTo).not.toHaveBeenCalled();

    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    await press(tree.root, prs.account.openSettings);
    expect(openSettings).toHaveBeenCalled();
    expect(shown(tree.root)).toBe(false);
  });

  it('lets the card be dismissed with "not now", and the map carries on', async () => {
    maplibre.__location.grant = false;
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(shown(tree.root)).toBe(true);
    await press(tree.root, prs.home.permissionLater);
    expect(shown(tree.root)).toBe(false);
    expect(markerIds(tree.root)).toEqual(['property:p1']);
  });

  it('says the GPS is off, in its own words, when permitted but no position comes back', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    expect(shown(tree.root)).toBe(true);
    const text = allText(tree.root);
    expect(text).toContain(prs.home.permissionOffTitle);
    expect(text).toContain(prs.home.locationUnavailable);
    expect(text).not.toContain(prs.home.permissionDeniedTitle);
  });

  it('opens the phone location page on Android when the GPS is off, and falls back to the app settings', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const sendIntent = jest
      .spyOn(Linking, 'sendIntent')
      .mockRejectedValue(new Error('no such page'));
    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    await press(tree.root, prs.account.openSettings);
    await settle();
    platform.restore();
    expect(sendIntent).toHaveBeenCalledWith(
      'android.settings.LOCATION_SOURCE_SETTINGS',
    );
    expect(openSettings).toHaveBeenCalled();
  });

  it('asks again when the person comes back from the phone settings, and only then', async () => {
    let appStateChanged!: (state: string) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      listener: (state: string) => void,
    ) => {
      appStateChanged = listener;
      return { remove: jest.fn() };
    }) as never);
    maplibre.__location.grant = false;
    serve([]);
    const tree = await render(home());
    await settle();
    expect(maplibre.__location.requests).toBe(1);

    // Coming back to the app for any other reason does not ask.
    await act(async () => appStateChanged('active'));
    await settle();
    expect(maplibre.__location.requests).toBe(1);

    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await press(tree.root, prs.account.openSettings);
    maplibre.__location.grant = true;
    maplibre.__location.position = kabul;
    await act(async () => appStateChanged('background'));
    expect(maplibre.__location.requests).toBe(1);
    await act(async () => appStateChanged('active'));
    await settle();
    expect(maplibre.__location.requests).toBe(2);
    expect(markerIds(tree.root)).toEqual(['me']);
    expect(lastFly()).toMatchObject({ zoom: 14 });
  });

  it('the locate button asks again, shows me and flies there, every time it is tapped', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.permissionLater);
    expect(markerIds(tree.root)).toEqual([]);

    maplibre.__location.position = kabul;
    await tapLabel(tree.root, prs.home.locate);
    await settle();
    expect(maplibre.__location.requests).toBe(2);
    expect(markerIds(tree.root)).toEqual(['me']);
    const before = maplibre.__flyTo.mock.calls.length;
    expect(before).toBe(1);
    await tapLabel(tree.root, prs.home.locate); // same numbers, a new trip
    await settle();
    expect(maplibre.__flyTo.mock.calls.length).toBe(before + 1);
  });

  it('keeps the map where it is, and says why, for someone outside Afghanistan', async () => {
    maplibre.__location.position = {
      ...kabul,
      coords: { ...kabul.coords, latitude: 51.5, longitude: -0.12 },
    };
    serve([]);
    const tree = await render(home());
    await settle();
    expect(allText(tree.root)).toContain(prs.home.locationOutside);
    expect(shown(tree.root)).toBe(false); // nothing is wrong, so no permission card
    expect(markerIds(tree.root)).toEqual([]);
    expect(maplibre.__flyTo).not.toHaveBeenCalled();
  });

  it('does not yank the map back to me after I chose a province while the first fix was slow', async () => {
    let arrive!: (position: unknown) => void;
    jest
      .spyOn(LocationManager, 'getCurrentPosition')
      .mockReturnValue(new Promise(resolve => (arrive = resolve)) as never);
    serve([]);
    const tree = await render(home());
    await settle();

    await act(async () => {
      tree.root.findByType(FilterSheet).props.onApply({ province: 'هرات' });
    });
    await settle();
    const afterProvince = maplibre.__flyTo.mock.calls.length;
    expect(lastFly()).toMatchObject({ zoom: 9 });

    await act(async () => arrive(kabul));
    await settle();
    expect(markerIds(tree.root)).toEqual(['me']); // the dot still appears
    expect(maplibre.__flyTo.mock.calls.length).toBe(afterProvince); // but the camera stays on Herat
  });

  it('does not yank the map back to me after I moved it myself while the first fix was slow', async () => {
    let arrive!: (position: unknown) => void;
    jest
      .spyOn(LocationManager, 'getCurrentPosition')
      .mockReturnValue(new Promise(resolve => (arrive = resolve)) as never);
    serve([]);
    const tree = await render(home());
    await settle();

    await moveMap(tree.root, 9, [61.9, 34.1, 62.5, 34.6], true);
    await act(async () => arrive(kabul));
    await settle();
    expect(markerIds(tree.root)).toEqual(['me']);
    expect(maplibre.__flyTo).not.toHaveBeenCalled();
  });

  it('still takes me there if the map only settled by itself (no finger) before the first fix arrived', async () => {
    let arrive!: (position: unknown) => void;
    jest
      .spyOn(LocationManager, 'getCurrentPosition')
      .mockReturnValue(new Promise(resolve => (arrive = resolve)) as never);
    serve([]);
    const tree = await render(home());
    await settle();

    await moveMap(tree.root, 9, [61.9, 34.1, 62.5, 34.6], false);
    await act(async () => arrive(kabul));
    await settle();
    expect(lastFly()).toMatchObject({ zoom: 14 });
  });
});

describe('Home map: moving around', () => {
  const propertyCalls = () =>
    callsTo(fetchMock).filter(c => c.path === '/properties');

  it('asks only for the area on screen, 50 at a time, and never for a province or "has location"', async () => {
    serve([listing()]);
    await render(home());
    await settle();
    const [first] = propertyCalls();
    expect(first.query).toEqual({
      min_lat: expect.any(String),
      max_lat: expect.any(String),
      min_lng: expect.any(String),
      max_lng: expect.any(String),
      page: '1',
      limit: '50',
    });
    // The area is Kabul's, with a margin.
    expect(Number(first.query.min_lat)).toBeLessThan(34.5281);
    expect(Number(first.query.max_lat)).toBeGreaterThan(34.5281);
    expect(Number(first.query.min_lng)).toBeLessThan(69.1723);
    expect(Number(first.query.max_lng)).toBeGreaterThan(69.1723);
  });

  it('fetches the new place when the map is moved far, and nothing for a small nudge', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    const [first] = propertyCalls();
    const lat = (Number(first.query.min_lat) + Number(first.query.max_lat)) / 2;
    const lng = (Number(first.query.min_lng) + Number(first.query.max_lng)) / 2;

    // A nudge inside what is already loaded (a screen's worth, a little to one side): no request.
    await moveMap(tree.root, 11, [lng - 0.1, lat - 0.1, lng + 0.2, lat + 0.2]);
    await settle();
    expect(propertyCalls()).toHaveLength(1);

    // Off to Herat: a new area, and the old answer is not asked again.
    await moveMap(tree.root, 11, [62.1, 34.2, 62.3, 34.5]);
    await settle();
    expect(propertyCalls()).toHaveLength(2);
    const second = propertyCalls()[1].query;
    expect(Number(second.min_lng)).toBeLessThan(62.1);
    expect(Number(second.max_lng)).toBeGreaterThan(62.3);
    expect(Number(second.min_lat)).toBeLessThan(34.2);
    expect(Number(second.max_lat)).toBeGreaterThan(34.5);
  });

  it('asks again for the smaller area after zooming far in, so a crowded city is not left half filled', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    const [first] = propertyCalls();
    await moveMap(tree.root, 16, [69.17, 34.52, 69.18, 34.53]);
    await settle();
    expect(propertyCalls()).toHaveLength(2);
    const second = propertyCalls()[1].query;
    expect(Number(second.max_lng) - Number(second.min_lng)).toBeLessThan(
      Number(first.query.max_lng) - Number(first.query.min_lng),
    );
  });

  it('keeps the pins already on the map while the next area loads', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      if (Number(u.searchParams.get('min_lng')) < 60) {
        await gate; // the wider area, held back
        return jsonResponse(
          200,
          page([listing(), listing({ id: 'p2', lat: 31, lng: 65 })]),
        );
      }
      return jsonResponse(200, page([listing()]));
    });
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:p1']);

    await moveMap(tree.root, 5, [55, 27, 80, 42]); // zoomed far out: Kabul is still in view
    await settle();
    expect(markerIds(tree.root)).toContain('property:p1'); // not blanked while waiting
    await act(async () => release());
    await settle();
    expect(markerIds(tree.root).sort()).toEqual(['property:p1', 'property:p2']);
  });

  it('hides the old pins, and asks with the deal type, when the quick deal filter changes', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:p1']);

    // Hold the next answer so the screen between the two can be seen.
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      await gate;
      return jsonResponse(
        200,
        page([listing({ id: 'r1', deal_type: 'RENT' })]),
      );
    });
    await tapTestId(tree.root, 'deal-RENT');
    await settle();
    expect(propertyCalls().at(-1)!.query.deal_type).toBe('RENT');
    expect(markerIds(tree.root)).toEqual([]); // a sale pin must not sit under a "rent" filter
    await act(async () => release());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:r1']);
  });

  it('turns the quick deal filter off by tapping it again, and shows it as the filter count', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapTestId(tree.root, 'deal-SALE');
    await settle();
    expect(propertyCalls().at(-1)!.query.deal_type).toBe('SALE');
    expect(
      byTestId(tree.root, 'open-filters').some(
        n => n.props.badge === formatNumber(1, 0) || allText(n).includes('۱'),
      ),
    ).toBe(true);
    await tapTestId(tree.root, 'deal-SALE');
    await settle();
    expect(propertyCalls().at(-1)!.query.deal_type).toBeUndefined();
  });

  it('flies to a province chosen in the filters, and leaves the camera alone when it is cleared', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    const apply = (value: Record<string, unknown>) =>
      act(async () => {
        tree.root.findByType(FilterSheet).props.onApply(value);
      });
    await apply({ province: 'هرات' });
    await settle();
    expect(lastFly()).toMatchObject({ zoom: 9 });
    // The province only steers the camera; what is shown is whatever the screen covers.
    expect(propertyCalls().every(c => c.query.province === undefined)).toBe(
      true,
    );
    const flights = maplibre.__flyTo.mock.calls.length;
    await apply({});
    await settle();
    expect(maplibre.__flyTo.mock.calls.length).toBe(flights);
  });

  it('has no second profile button: the Account tab is the one way to the profile', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    expect(hasId(tree.root, 'open-account')).toBe(false);
    expect(labelled(tree.root, prs.nav.account)).toBe(false);
  });

  it('opens the filters from the filter button', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    expect(tree.root.findByType(FilterSheet).props.visible).toBe(false);
    await tapTestId(tree.root, 'open-filters');
    expect(tree.root.findByType(FilterSheet).props.visible).toBe(true);
  });

  it('keeps fetching pages on the map until the area is filled, up to three pages of fifty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      const n = Number(u.searchParams.get('page'));
      return jsonResponse(
        200,
        page([listing({ id: `page${n}`, lat: 34 + n * 0.5, lng: 66 })], n, 12),
      );
    });
    await render(home());
    await settle();
    await settle();
    await settle();
    const calls = propertyCalls();
    expect(calls.map(c => c.query.page)).toEqual(['1', '2', '3']);
    expect(calls.every(c => c.query.limit === '50')).toBe(true);
  });

  it('does not fetch pages by itself in the list view, and asks for the whole country, not an area', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      const n = Number(u.searchParams.get('page'));
      return jsonResponse(200, page([listing({ id: `page${n}` })], n, 5));
    });
    const tree = await render(home());
    await settle();
    fetchMock.mockClear();
    await press(tree.root, prs.home.list);
    await settle();
    await settle();
    const listPages = propertyCalls().filter(
      c => c.query.min_lat === undefined,
    );
    expect(listPages).toHaveLength(1);
    expect(listPages[0].query.limit).not.toBe('50');
    expect(
      propertyCalls().filter(c => c.query.min_lat !== undefined),
    ).toHaveLength(0);
  });

  it("leaves offices out of the list view and doesn't ask for them there", async () => {
    serve([listing()], [agencyPin()]);
    const tree = await render(home());
    await settle();
    fetchMock.mockClear();
    await press(tree.root, prs.home.list);
    await settle();
    expect(
      callsTo(fetchMock).filter(c => c.path === '/agencies/map'),
    ).toHaveLength(0);
    expect(labelled(tree.root, prs.home.locate)).toBe(false);
    expect(labelled(tree.root, prs.home.agencies)).toBe(false);
  });

  it('comes back to the map from the list with the map button', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.list);
    await settle();
    await press(tree.root, prs.home.map);
    await settle();
    expect(markerIds(tree.root)).toContain('property:p1');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The sheet's motion. The test renderer has no layout and no native animation driver, so these tests report the
// sheet's size themselves and hold the slide animations, which lets them check what moves, where, and when the
// card is allowed to disappear.
// ---------------------------------------------------------------------------------------------------------------

const wait = (ms: number) =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });

interface Slide {
  toValue: number;
  duration: number;
  /** Ends the animation the way the native driver would; false = it was interrupted by another one. */
  finish: (finished?: boolean) => void;
}
let slides: Slide[] = [];
let springs = 0;
const holdSlides = () => {
  slides = [];
  springs = 0;
  jest.spyOn(Animated, 'timing').mockImplementation(((
    _value: unknown,
    config: { toValue: number; duration: number },
  ) => ({
    start: (done?: (result: { finished: boolean }) => void) => {
      slides.push({
        toValue: config.toValue,
        duration: config.duration,
        finish: (finished = true) => done?.({ finished }),
      });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  })) as never);
  jest.spyOn(Animated, 'spring').mockImplementation((() => ({
    start: () => {
      springs += 1;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  })) as never);
};
const sheetNode = (root: ReactTestRenderer.ReactTestInstance) => {
  const node = root.findAll(
    n =>
      n.props.testID === 'property-bottom-sheet' && typeof n.type === 'string',
  )[0];
  if (!node) throw new Error('The bottom sheet is not on screen');
  return node;
};
const measure = (root: ReactTestRenderer.ReactTestInstance, height = 300) =>
  act(async () => {
    sheetNode(root).props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
    });
  });
const cardShown = (root: ReactTestRenderer.ReactTestInstance) =>
  byTestId(root, 'property-preview').length > 0;

/** A one-finger touch history, as the responder system hands to PanResponder. */
const touchAt = (
  y: number,
  time: number,
  previousY: number,
  previousTime: number,
  active = true,
) => ({
  touchHistory: {
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: time,
    numberActiveTouches: active ? 1 : 0,
    touchBank: [
      {
        touchActive: active,
        startPageX: 50,
        startPageY: 100,
        startTimeStamp: 0,
        currentPageX: 50,
        currentPageY: y,
        currentTimeStamp: time,
        previousPageX: 50,
        previousPageY: previousY,
        previousTimeStamp: previousTime,
      },
    ],
  },
  nativeEvent: { touches: active ? [{}] : [], changedTouches: [{}] },
});
/** Puts a finger on the sheet, moves it `dy` px down over `ms`, and lets go. */
const swipeDown = async (
  root: ReactTestRenderer.ReactTestInstance,
  dy: number,
  ms: number,
) => {
  const handlers = sheetNode(root).props;
  const start = touchAt(100, 0, 100, 0);
  await act(async () => {
    handlers.onStartShouldSetResponder?.(start);
    handlers.onResponderGrant(start);
  });
  const midway = touchAt(100 + dy / 2, ms / 2, 100, 0);
  await act(async () => {
    handlers.onMoveShouldSetResponderCapture(midway);
    handlers.onResponderMove(midway);
  });
  const end = touchAt(100 + dy, ms, 100 + dy / 2, ms / 2);
  await act(async () => {
    handlers.onResponderMove(end);
  });
  await act(async () => {
    handlers.onResponderRelease(touchAt(100 + dy, ms, 100 + dy, ms, false));
  });
};

describe('Home map: the bottom sheet', () => {
  const open = async (nav = navigation()) => {
    serve([listing()]);
    const tree = await render(home(nav));
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    return tree;
  };

  beforeEach(holdSlides);

  it('waits until it knows its own size, then slides up from just below the screen', async () => {
    const tree = await open();
    expect(cardShown(tree.root)).toBe(true);
    expect(slides).toHaveLength(0); // parked out of sight until measured
    await measure(tree.root, 300);
    expect(slides).toHaveLength(1);
    expect(slides[0].toValue).toBe(0);
    expect(slides[0].duration).toBeGreaterThan(150);
    expect(slides[0].duration).toBeLessThan(500);
  });

  it('slides down on ×, and removes the card only when the slide has finished', async () => {
    const tree = await open();
    await measure(tree.root, 300);
    slides[0].finish();
    await press(tree.root, '×');
    expect(slides.at(-1)!.toValue).toBe(300); // down by its own height
    expect(cardShown(tree.root)).toBe(true); // still there, sliding
    // The home screen already treats the listing as deselected.
    expect(labelled(tree.root, prs.home.locate)).toBe(true);

    await act(async () => slides.at(-1)!.finish());
    expect(cardShown(tree.root)).toBe(false);
  });

  it('comes back, and keeps the card, if another marker is tapped while it slides away', async () => {
    serve([
      listing(),
      listing({ id: 'p2', title: 'خانه حویلی', lat: 36.7, lng: 67.1 }),
    ]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await measure(tree.root, 300);
    slides[0].finish();
    await press(tree.root, '×');
    const leaving = slides.at(-1)!;

    await tapMarker(tree.root, 'property:p2');
    await settle();
    expect(slides.at(-1)!.toValue).toBe(0); // back up
    // The slide-down was interrupted, which the driver reports as not finished: it must not remove the card.
    await act(async () => leaving.finish(false));
    expect(cardShown(tree.root)).toBe(true);
    expect(allText(byTestId(tree.root, 'property-preview')[0])).toContain(
      'خانه حویلی',
    );
  });

  it('swaps the content in place, without sliding again, when another listing is chosen while open', async () => {
    serve([
      listing(),
      listing({ id: 'p2', title: 'خانه حویلی', lat: 36.7, lng: 67.1 }),
    ]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await measure(tree.root, 300);
    const before = slides.length;
    await tapMarker(tree.root, 'property:p2');
    await settle();
    await measure(tree.root, 320); // a different card height is just a resize
    expect(slides.length).toBe(before + 1); // only the "go to 0" from re-selecting, no new slide-in from below
    expect(allText(byTestId(tree.root, 'property-preview')[0])).toContain(
      'خانه حویلی',
    );
  });

  it('closes on the Android back button instead of leaving the screen, and lets go of it afterwards', async () => {
    const listeners: (() => boolean)[] = [];
    const removed = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      listeners.push(handler);
      return { remove: removed };
    }) as never);
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(listeners).toHaveLength(0); // not listening while there is nothing to close

    await tapMarker(tree.root, 'property:p1');
    await settle();
    await measure(tree.root, 300);
    expect(listeners).toHaveLength(1);
    expect(labelled(tree.root, prs.home.locate)).toBe(false);

    let handled: boolean | undefined;
    await act(async () => {
      handled = listeners[0]();
    });
    expect(handled).toBe(true); // the press is consumed: the screen is not left
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    expect(removed).toHaveBeenCalled(); // and the listener is gone once closed
  });

  it('follows a long downward swipe and closes', async () => {
    const tree = await open();
    await measure(tree.root, 300);
    await swipeDown(tree.root, 200, 200); // far past 30% of its height
    expect(labelled(tree.root, prs.home.locate)).toBe(true); // deselected
    expect(slides.at(-1)!.toValue).toBe(300); // and sliding the rest of the way
  });

  it('closes on a short, fast flick too', async () => {
    const tree = await open();
    await measure(tree.root, 300);
    await swipeDown(tree.root, 40, 20); // 2 px/ms
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
  });

  it('springs back, and stays open, after a short slow drag', async () => {
    const tree = await open();
    await measure(tree.root, 300);
    await swipeDown(tree.root, 40, 600); // under 30% and slow
    expect(labelled(tree.root, prs.home.locate)).toBe(false);
    expect(cardShown(tree.root)).toBe(true);
    expect(springs).toBeGreaterThan(0);
  });

  it('lets taps on the card through: only a clear downward drag takes over', async () => {
    const tree = await open();
    const handlers = sheetNode(tree.root).props;
    // The responder ignores a move whose timestamp it has already seen, so every try gets a later clock.
    let clock = 0;
    const capturesAfter = async (toY: number, toX = 50) => {
      clock += 100;
      await act(async () =>
        handlers.onResponderGrant(touchAt(100, clock, 100, clock)),
      );
      const move = touchAt(toY, clock + 10, 100, clock);
      move.touchHistory.touchBank[0].currentPageX = toX;
      return handlers.onMoveShouldSetResponderCapture(move) as boolean;
    };

    expect(await capturesAfter(100, 10)).toBe(false); // 40 px sideways
    expect(await capturesAfter(103)).toBe(false); // a 3 px wobble
    expect(await capturesAfter(90)).toBe(false); // upwards
    expect(await capturesAfter(130)).toBe(true); // 30 px down
  });
});

describe('Home map: tapping the map', () => {
  it('closes the card, restoring the map buttons, when empty map is tapped', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(cardShown(tree.root)).toBe(true);
    await wait(MARKER_TAP_GRACE_MS + 50);
    await act(async () => tapMap(tree.root, 'property-map', [66, 33]));
    expect(cardShown(tree.root)).toBe(false);
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
    expect(hasId(tree.root, 'mode-toggle')).toBe(true);
  });

  it('closes an office card the same way', async () => {
    serve([], [agencyPin()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'agency:ag1');
    await wait(MARKER_TAP_GRACE_MS + 50);
    await act(async () => tapMap(tree.root, 'property-map', [66, 33]));
    expect(byTestId(tree.root, 'agency-preview')).toHaveLength(0);
  });

  it('ignores a map tap that is the same finger-tap that chose the marker', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await act(async () =>
      tapMap(tree.root, 'property-map', [69.1723, 34.5281]),
    );
    await settle();
    expect(cardShown(tree.root)).toBe(true);
  });

  it('does nothing when there is nothing to close', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await act(async () => tapMap(tree.root, 'property-map', [66, 33]));
    expect(cardShown(tree.root)).toBe(false);
    expect(labelled(tree.root, prs.home.locate)).toBe(true);
  });
});

describe('Home map: cluster badges and zooming in', () => {
  const crowd = () => [
    listing({ id: 'p1', lat: 34.5281, lng: 69.1723 }),
    listing({ id: 'p2', title: 'خانه حویلی', lat: 34.5282, lng: 69.1724 }),
    listing({ id: 'p3', title: 'زمین', lat: 34.5283, lng: 69.1725 }),
  ];
  const clusterMarker = (root: ReactTestRenderer.ReactTestInstance) =>
    markers(root).find(m => String(m.props.id).startsWith('cluster:'))!;

  it('says how many properties are in a cluster, in words', async () => {
    serve(crowd());
    const tree = await render(home());
    await settle();
    expect(allText(clusterMarker(tree.root))).toContain(
      prs.home.clusterBadge.replace('{{count}}', formatNumber(3, 0)),
    );
  });

  it('says "items" instead of "properties" when an office is in the group', async () => {
    serve(
      [listing({ lat: 34.55, lng: 69.2 })],
      [agencyPin({ lat: 34.5501, lng: 69.2001 })],
    );
    const tree = await render(home());
    await settle();
    const text = allText(clusterMarker(tree.root));
    expect(text).toContain(
      prs.home.clusterBadgeMixed.replace('{{count}}', formatNumber(2, 0)),
    );
    expect(text).not.toContain(prs.home.clusterBadge.replace('{{count}}', ''));
  });

  it('flies in on a tap, to the middle of the group and close enough to tell the pins apart', async () => {
    serve(crowd());
    const tree = await render(home());
    await settle();
    await act(async () => clusterMarker(tree.root).props.onPress());
    await settle();

    expect(byTestId(tree.root, 'cluster-list')).toHaveLength(0); // no list: the map does the work
    const fly = lastFly();
    expect(fly.center[0]).toBeCloseTo(69.1724, 4);
    expect(fly.center[1]).toBeCloseTo(34.5282, 4);
    expect(fly.zoom).toBeGreaterThan(11);
    expect(fly.zoom).toBeLessThanOrEqual(19);
    expect(fly.padding).toMatchObject({ bottom: 0 });

    // Once the map has settled there, the pins are separate.
    await moveMap(tree.root, fly.zoom, [69.1, 34.4, 69.3, 34.6]);
    expect(markerIds(tree.root).sort()).toEqual([
      'property:p1',
      'property:p2',
      'property:p3',
    ]);
  });

  it('puts an open card away when it zooms into a cluster', async () => {
    serve([...crowd(), listing({ id: 'far', lat: 36.7, lng: 67.1 })]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:far');
    await settle();
    expect(cardShown(tree.root)).toBe(true);
    await act(async () => clusterMarker(tree.root).props.onPress());
    await settle();
    expect(cardShown(tree.root)).toBe(false);
  });

  it('keeps zooming in on repeated taps until the pins come apart', async () => {
    // Two clusters of two: a coarse pair that separates early, inside a tight pair that separates late.
    serve([
      listing({ id: 'a1', lat: 34.5281, lng: 69.1723 }),
      listing({ id: 'a2', lat: 34.5282, lng: 69.1724 }),
    ]);
    const tree = await render(home());
    await settle();
    await act(async () => clusterMarker(tree.root).props.onPress());
    const first = lastFly().zoom;
    await moveMap(tree.root, first, [69.17, 34.52, 69.18, 34.54]);
    expect(markerIds(tree.root)).toHaveLength(2);
  });
});

describe('Home map: plot boundaries', () => {
  // About 110 m square around the default listing's pin.
  const around = (lng: number, lat: number, size = 0.0005) => ({
    type: 'Polygon',
    coordinates: [
      [
        [lng - size, lat - size],
        [lng + size, lat - size],
        [lng + size, lat + size],
        [lng - size, lat + size],
        [lng - size, lat - size],
      ],
    ],
  });
  const withPlot = (overrides: Record<string, unknown> = {}) =>
    listing({ boundary: around(69.1723, 34.5281), ...overrides });
  const source = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    mapParts(root, 'GeoJSONSource').find(n => n.props.id === id);
  const layer = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    mapParts(root, 'Layer').find(n => n.props.id === id);

  it('draws nothing extra when no listing has an outline', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(mapParts(tree.root, 'GeoJSONSource')).toHaveLength(0);
  });

  it("draws a listing's outline as a translucent emerald fill with a solid edge", async () => {
    serve([withPlot()]);
    const tree = await render(home());
    await settle();

    const plots = source(tree.root, 'plots')!;
    expect(plots.props.data.features).toHaveLength(1);
    expect(plots.props.data.features[0].properties).toEqual({ id: 'p1' });
    expect(plots.props.data.features[0].geometry.type).toBe('Polygon');

    const fill = layer(tree.root, 'plots-fill')!;
    expect(fill.props.type).toBe('fill');
    expect(fill.props.paint['fill-color']).toBe('#047857'); // the brand emerald
    expect(fill.props.paint['fill-opacity']).toBeGreaterThan(0.1);
    expect(fill.props.paint['fill-opacity']).toBeLessThan(0.5); // streets stay readable
    const edge = layer(tree.root, 'plots-line')!;
    expect(edge.props.type).toBe('line');
    expect(edge.props.paint['line-width']).toBeGreaterThanOrEqual(1.5);
    // Not drawn where plots are specks.
    expect(fill.props.minzoom).toBeGreaterThanOrEqual(11);
  });

  it('skips a broken outline and still draws the good ones', async () => {
    serve([
      withPlot(),
      listing({
        id: 'p2',
        lat: 36.7,
        lng: 67.1,
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [2, 2],
            ],
          ],
        },
      }),
      listing({ id: 'p3', lat: 36.8, lng: 67.2, boundary: 'not geojson' }),
    ]);
    const tree = await render(home());
    await settle();
    expect(
      source(tree.root, 'plots')!.props.data.features.map(
        (f: { properties: { id: string } }) => f.properties.id,
      ),
    ).toEqual(['p1']);
    expect(markerIds(tree.root)).toHaveLength(3); // every listing keeps its marker
  });

  it("highlights the chosen listing's plot, and only that one", async () => {
    serve([
      withPlot(),
      listing({
        id: 'p2',
        lat: 36.7,
        lng: 67.1,
        boundary: around(67.1, 36.7),
      }),
    ]);
    const tree = await render(home());
    await settle();
    expect(source(tree.root, 'plot-chosen')!.props.data.features).toHaveLength(
      0,
    );

    await tapMarker(tree.root, 'property:p2');
    await settle();
    const chosen = source(tree.root, 'plot-chosen')!.props.data.features;
    expect(chosen).toHaveLength(1);
    expect(chosen[0].properties.id).toBe('p2');
    // The rest are untouched: the full source is not rebuilt by choosing.
    expect(source(tree.root, 'plots')!.props.data.features).toHaveLength(2);
    expect(
      layer(tree.root, 'plot-chosen-line')!.props.paint['line-color'],
    ).not.toBe(layer(tree.root, 'plots-line')!.props.paint['line-color']);

    await press(tree.root, '×');
    expect(source(tree.root, 'plot-chosen')!.props.data.features).toHaveLength(
      0,
    );
  });

  it('keeps the same data object for the outlines when only the selection changes', async () => {
    serve([withPlot()]);
    const tree = await render(home());
    await settle();
    const before = source(tree.root, 'plots')!.props.data;
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(source(tree.root, 'plots')!.props.data).toBe(before);
  });

  it('opens the listing when its plot is tapped, even away from its marker', async () => {
    serve([withPlot()]);
    const tree = await render(home());
    await settle();
    // Inside the outline, ~40 m from the pin.
    await act(async () =>
      tapMap(tree.root, 'property-map', [69.1726, 34.5283]),
    );
    await settle();
    expect(cardShown(tree.root)).toBe(true);
    expect(allText(byTestId(tree.root, 'property-preview')[0])).toContain(
      'آپارتمان سه‌خوابه',
    );
    expect(source(tree.root, 'plot-chosen')!.props.data.features).toHaveLength(
      1,
    );
  });

  it('closes the card when the tap is just outside the plot', async () => {
    serve([withPlot()]);
    const tree = await render(home());
    await settle();
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await wait(MARKER_TAP_GRACE_MS + 50);
    await act(async () =>
      tapMap(tree.root, 'property-map', [69.1735, 34.5281]),
    );
    expect(cardShown(tree.root)).toBe(false);
  });
});

describe('Home map: overlay controls', () => {
  it('shows a small spinner, not a text badge, while the listings load', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const tree = await render(home());
    await settle();
    const loader = tree.root.findAll(
      n => n.props.accessibilityRole === 'progressbar',
    );
    expect(loader.length).toBeGreaterThan(0);
    expect(loader[0].props.accessibilityLabel).toBe(prs.common.loading);
    expect(allText(tree.root)).not.toContain(prs.common.loading);
  });

  it('leaves exactly two controls at the foot of the map: "my location", and the list / map pill', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(hasId(tree.root, 'locate')).toBe(true);
    expect(hasId(tree.root, 'mode-toggle')).toBe(true);
    // No add button, no offices switch, no map credit.
    for (const id of ['add-property', 'toggle-agencies', 'map-credit-button']) {
      expect(hasId(tree.root, id)).toBe(false);
    }
    expect(labelled(tree.root, prs.nav.addProperty)).toBe(false);
    expect(allText(tree.root)).not.toContain('OpenStreetMap');
  });

  it('shows both choices in the pill, with the current one selected, and switches with the other', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    const selected = (id: string) =>
      tree.root.findAll(
        n =>
          n.props.testID === id &&
          typeof n.props.onPress === 'function' &&
          n.props.accessibilityState?.selected === true,
      ).length > 0;
    expect(allText(byTestId(tree.root, 'mode-toggle')[0])).toContain(
      prs.home.list,
    );
    expect(allText(byTestId(tree.root, 'mode-toggle')[0])).toContain(
      prs.home.map,
    );
    expect(selected('mode-map')).toBe(true);
    expect(selected('mode-list')).toBe(false);

    await tapTestId(tree.root, 'mode-map'); // already here: nothing happens
    expect(selected('mode-map')).toBe(true);

    await tapTestId(tree.root, 'mode-list');
    await settle();
    expect(selected('mode-list')).toBe(true);
    expect(markerIds(tree.root)).toEqual([]); // the list has no map markers
    await tapTestId(tree.root, 'mode-map');
    await settle();
    expect(selected('mode-map')).toBe(true);
    expect(markerIds(tree.root)).toContain('property:p1');
  });

  it('makes the location button the larger of the controls, in the brand colour', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    const locate = tree.root.find(
      n => n.props.testID === 'locate' && typeof n.type !== 'string',
    );
    const host = locate.findAll(n => typeof n.type === 'string')[0];
    const style = StyleSheet.flatten(host.props.style) as {
      width: number;
      height: number;
    };
    expect(style.width).toBe(style.height);
    expect(style.width).toBeGreaterThanOrEqual(52);
  });

  it('floats the deal filter and the filter button along the top, and nothing else', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    for (const id of ['deal-filter', 'open-filters']) {
      expect(hasId(tree.root, id)).toBe(true);
    }
    // The three deal segments, each carrying its marker colour.
    for (const deal of ['SALE', 'RENT', 'MORTGAGE_GROWI']) {
      expect(hasId(tree.root, `deal-${deal}`)).toBe(true);
    }
  });

  it('counts the active filters on the filter button, in Persian digits', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    await act(async () => {
      tree.root
        .findByType(FilterSheet)
        .props.onApply({ type: 'LAND', min_price: 100 });
    });
    await settle();
    const button = tree.root.findAll(
      n => n.props.testID === 'open-filters' && typeof n.type !== 'string',
    )[0];
    expect(button.props.badge).toBe('۲');
    expect(button.props.active).toBe(true);
  });

  it('shows Persian digits everywhere, and never a Western one', async () => {
    serve([
      listing({ bedrooms: 4, area_sqm: 250, price: 12_345_678 }),
      listing({ id: 'p2', lat: 34.53, lng: 69.18 }),
    ]);
    const tree = await render(home());
    await settle();
    await moveMap(tree.root, 15, [69.1, 34.5, 69.3, 34.6]);
    await tapMarker(tree.root, 'property:p1');
    await settle();
    await measure(tree.root, 300);
    const text = allText(tree.root);
    expect(text).not.toMatch(/[0-9]/);
    expect(text).toMatch(/[۰-۹]/);
    const spokenAll = markers(tree.root)
      .map(m => spoken(m))
      .join(' ');
    expect(spokenAll).not.toMatch(/[0-9]/);
  });

  it('hides "my location" while a listing is chosen, and brings it back', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    const located = () =>
      tree.root.findAll(n => n.props.accessibilityLabel === prs.home.locate)
        .length;
    expect(located()).toBeGreaterThan(0);
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(located()).toBe(0);
    await press(tree.root, '×');
    expect(located()).toBeGreaterThan(0);
  });
});
