import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking } from 'react-native';
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
} from '../test-utils';
import { mockNavigation } from '../test-utils/navMock';

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
) =>
  act(async () => {
    const map = mapParts(root, 'Map').find(
      n => n.props.testID === 'property-map',
    )!;
    map.props.onRegionDidChange({ nativeEvent: { zoom, bounds } });
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
  it('opens on the map, with a property marker showing its type, short price and seller', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['property:p1']);
    const text = allText(marker(tree.root, 'property:p1'));
    expect(text).toContain('🏢'); // apartment
    expect(text).toContain('۲٫۵ میلیون ؋');
    expect(text).toContain(prs.property.owner); // a private seller
  });

  it("names the agency as the seller when the listing belongs to one, and stars a featured listing", async () => {
    serve([
      listing({
        agency_id: 'ag1',
        agency_name: 'دفتر املاک نور',
        is_featured: true,
        type: 'HOUSE_HAWILI',
        price: 800,
        currency: 'USD',
      }),
    ]);
    const tree = await render(home());
    await settle();
    const text = allText(marker(tree.root, 'property:p1'));
    expect(text).toContain('دفتر املاک نور');
    expect(text).toContain('★');
    expect(text).toContain('🏠');
    expect(text).toContain('۸۰۰ $');
    expect(text).not.toContain(prs.property.owner);
  });

  it('draws verified offices as their own kind of marker: name and tick, no price', async () => {
    serve([listing()], [agencyPin()]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root).sort()).toEqual(['agency:ag1', 'property:p1']);
    const text = allText(marker(tree.root, 'agency:ag1'));
    expect(text).toContain('دفتر املاک نور');
    expect(text).toContain('✓');
    expect(text).not.toContain('؋');
  });

  it('hides the offices with the chip, and brings them back', async () => {
    serve([listing()], [agencyPin()]);
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.agencies);
    expect(markerIds(tree.root)).toEqual(['property:p1']);
    await press(tree.root, prs.home.agencies);
    await settle();
    expect(markerIds(tree.root)).toContain('agency:ag1');
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
    expect(text).toContain('۲٬۵۰۰٬۰۰۰ افغانی'); // the full price on the card
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

  it('closes with ×, restoring the hint and the add-listing button', async () => {
    serve([listing()]);
    const tree = await render(home());
    await settle();
    expect(allText(tree.root)).toContain(prs.home.mapHint);
    await tapMarker(tree.root, 'property:p1');
    await settle();
    expect(allText(tree.root)).not.toContain(prs.home.mapHint);
    expect(
      tree.root.findAll(n => n.props.accessibilityLabel === prs.nav.addProperty),
    ).toHaveLength(0);

    await press(tree.root, '×');
    expect(byTestId(tree.root, 'property-preview')).toHaveLength(0);
    expect(allText(tree.root)).toContain(prs.home.mapHint);
    expect(
      tree.root.findAll(n => n.props.accessibilityLabel === prs.nav.addProperty)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows the owner their own listing without contact buttons", async () => {
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

  it('opens a list of everything in the spot when a cluster is tapped, and picking one opens its card', async () => {
    serve(crowd(), []);
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
      [agencyPin({ lat: 34.5501, lng: 69.2001 })],
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
    serve(crowd());
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

  it('quietly finds me at start when location is already allowed: a blue dot, the map flies there, no prompt', async () => {
    maplibre.__location.position = kabul;
    serve([]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual(['me']);
    expect(maplibre.__location.requests).toBe(0);
    expect(lastFly()).toMatchObject({
      center: [69.1723, 34.5281],
      zoom: 14,
      padding: { bottom: 0 },
    });
  });

  it('does nothing visible, and never prompts, when location was never allowed', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual([]);
    expect(maplibre.__location.requests).toBe(0);
    expect(maplibre.__flyTo).not.toHaveBeenCalled();
  });

  it('the "my location" button asks, then shows me and flies there', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    maplibre.__location.position = kabul;
    await press(tree.root, prs.home.locate);
    await settle();
    expect(maplibre.__location.requests).toBe(1);
    expect(markerIds(tree.root)).toEqual(['me']);
    expect(lastFly()).toMatchObject({ zoom: 14 });
  });

  it('flies again when tapped a second time from somewhere else (same numbers, new trip)', async () => {
    maplibre.__location.position = kabul;
    serve([]);
    const tree = await render(home());
    await settle();
    const before = maplibre.__flyTo.mock.calls.length;
    await press(tree.root, prs.home.locate);
    await settle();
    expect(maplibre.__flyTo.mock.calls.length).toBe(before + 1);
  });

  it('explains a refusal and offers the phone settings', async () => {
    maplibre.__location.grant = false;
    serve([]);
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.locate);
    await settle();
    expect(allText(tree.root)).toContain(prs.home.locationDenied);
    expect(markerIds(tree.root)).toEqual([]);

    const openSettings = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    await press(tree.root, prs.account.openSettings);
    expect(openSettings).toHaveBeenCalled();
  });

  it('says when no position could be found', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.locate); // allowed, but no fix
    await settle();
    expect(allText(tree.root)).toContain(prs.home.locationUnavailable);
  });

  it('keeps the map where it is, and says why, for someone outside Afghanistan', async () => {
    maplibre.__location.position = {
      ...kabul,
      coords: { ...kabul.coords, latitude: 51.5, longitude: -0.12 },
    };
    serve([]);
    const tree = await render(home());
    await settle();
    expect(markerIds(tree.root)).toEqual([]); // quiet: no dot, no message
    await press(tree.root, prs.home.locate);
    await settle();
    expect(allText(tree.root)).toContain(prs.home.locationOutside);
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

    await press(tree.root, 'هرات');
    await settle();
    const afterProvince = maplibre.__flyTo.mock.calls.length;
    expect(lastFly()).toMatchObject({ zoom: 9 });

    await act(async () => arrive(kabul));
    await settle();
    expect(markerIds(tree.root)).toEqual(['me']); // the dot still appears
    expect(maplibre.__flyTo.mock.calls.length).toBe(afterProvince); // but the camera stays on Herat
  });
});

describe('Home map: moving around', () => {
  it('flies to a province when its chip is chosen, and back to the whole country when cleared', async () => {
    serve([]);
    const tree = await render(home());
    await settle();
    await press(tree.root, 'هرات');
    await settle();
    expect(lastFly()).toMatchObject({ zoom: 9 });
    await press(tree.root, 'هرات');
    await settle();
    expect(lastFly()).toMatchObject({ center: [67.7, 33.9], zoom: 4.8 });
  });

  it('keeps fetching pages on the map until the area is filled, then offers "show more"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      const n = Number(u.searchParams.get('page'));
      return jsonResponse(
        200,
        page([listing({ id: `page${n}`, lat: 34 + n * 0.5, lng: 66 })], n, 12),
      );
    });
    const tree = await render(home());
    await settle();
    await settle();
    await settle();
    const pages = callsTo(fetchMock)
      .filter(c => c.path === '/properties')
      .map(c => c.query.page);
    expect(pages).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1)), // stops at ten pages
    );
    expect(pressableWith(tree.root, prs.home.loadMore)).toBeTruthy();
  });

  it('does not fetch pages by itself in the list view', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/agencies/map') return jsonResponse(200, []);
      const n = Number(u.searchParams.get('page'));
      return jsonResponse(200, page([listing({ id: `page${n}` })], n, 5));
    });
    const tree = await render(home());
    await settle();
    await press(tree.root, prs.home.list);
    await settle();
    await settle();
    const listPages = callsTo(fetchMock).filter(
      c => c.path === '/properties' && c.query.has_location === undefined,
    );
    expect(listPages).toHaveLength(1);
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
    expect(
      tree.root.findAll(n => n.props.accessibilityLabel === prs.home.locate),
    ).toHaveLength(0);
  });
});
