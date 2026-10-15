import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { formatCurrency, formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render as renderTree,
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
import AgencyDashboardScreen from '../src/screens/agency/AgencyDashboardScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import PromotionSheet from '../src/components/PromotionSheet';

const agencyUser = {
  id: 'agency-user',
  role: 'AGENCY',
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
  contact_credits: 40,
  contact_credits_per_pack: 10,
};
const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';

const dashboard = (overrides: Record<string, unknown> = {}) => ({
  agency: { id: 'a1', agency_name: 'دفتر آریانا', is_verified: true },
  stats: {
    total_properties: 12,
    active_listings: 9,
    featured_listings: 2,
    total_views: 340,
  },
  subscription: {
    is_active: true,
    package_type: 'MONTHLY',
    ends_at: '2026-11-10T00:00:00Z',
    remaining_days: 28,
  },
  top_listings: [
    {
      id: L1,
      title: 'خانه حویلی در شهر نو',
      price: 5000000,
      currency: 'AFGHANI',
      view_count: 120,
      is_featured: true,
      featured_until: '2026-10-20T00:00:00Z',
      laddered_at: null,
    },
    {
      id: L2,
      title: 'آپارتمان کارته سه',
      price: 90000,
      currency: 'USD',
      view_count: 45,
      is_featured: false,
      featured_until: null,
      laddered_at: '2026-10-12T00:00:00Z',
    },
  ],
  ...overrides,
});

const PAYMENT = {
  id: 'pay1',
  purpose: 'LADDER',
  status: 'PENDING',
  amount: 50,
  currency: 'AFGHANI',
  created_at: '2026-10-13T00:00:00Z',
  payment_url: 'https://pay.example/x',
};
const payRoutes = (finalStatus: string) => ({
  'GET /hesabpay/pricing': { body: PRICING },
  'POST /hesabpay/payments': { status: 201, body: PAYMENT },
  'GET /hesabpay/payments/pay1': {
    body: { ...PAYMENT, status: finalStatus, payment_url: undefined },
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
const screenElement = <P extends object>(
  Screen: React.ComponentType<P>,
  nav: ReturnType<typeof navigation> = navigation(),
  route: object = {},
) =>
  withQuery(
    <Screen
      {...({
        navigation: nav,
        route: { params: undefined, ...route },
      } as unknown as P)}
    />,
  );

beforeAll(async () => {
  await initI18n();
});
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});
const openUrl = jest.fn(async () => true);
beforeEach(() => {
  fetchMock.mockReset();
  openUrl.mockClear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: agencyUser };
  jest
    .spyOn(require('react-native').Linking, 'openURL')
    .mockImplementation(openUrl);
});

const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const act = ReactTestRenderer.act;
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
const posts = (path: string) =>
  callsTo(fetchMock).filter(c => c.method === 'POST' && c.path === path);

describe('AgencyDashboardScreen', () => {
  it('shows the listing figures, the active subscription badge and days left', async () => {
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': { body: dashboard() },
    });
    const tree = await render(screenElement(AgencyDashboardScreen));
    await settle();

    const text = allText(tree.root);
    expect(text).toContain('دفتر آریانا');
    expect(text).toContain(prs.dashboard.verified);
    expect(text).toContain(prs.dashboard.subscriptionActive);
    expect(text).toContain(prs.package.MONTHLY);
    expect(text).toContain(
      prs.dashboard.daysLeft.replace('{{days}}', formatNumber(28, 0)),
    );
    for (const [label, value] of [
      [prs.dashboard.statTotal, 12],
      [prs.dashboard.statActive, 9],
      [prs.dashboard.statFeatured, 2],
      [prs.dashboard.statViews, 340],
    ] as const) {
      expect(text).toContain(label);
      expect(text).toContain(formatNumber(value, 0));
    }
    // Top listings with their views, and the featured one marked.
    expect(text).toContain('خانه حویلی در شهر نو');
    expect(text).toContain(
      prs.dashboard.views.replace('{{count}}', formatNumber(120, 0)),
    );
    expect(text).toContain('آپارتمان کارته سه');
    expect(callsTo(fetchMock)[0]).toMatchObject({
      method: 'GET',
      path: '/agencies/me/dashboard',
    });
  });

  it('offers to buy a subscription when none is running', async () => {
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': {
        body: dashboard({
          subscription: {
            is_active: false,
            package_type: null,
            ends_at: null,
            remaining_days: 0,
          },
        }),
      },
    });
    const nav = navigation();
    const tree = await render(screenElement(AgencyDashboardScreen, nav));
    await settle();

    const text = allText(tree.root);
    expect(text).toContain(prs.dashboard.subscriptionInactive);
    expect(text).not.toContain(prs.dashboard.renew); // no running plan to renew
    await press(tree.root, prs.dashboard.subscribe);
    expect(nav.navigate).toHaveBeenCalledWith('Checkout', {
      tab: 'subscription',
    });
  });

  it('has quick actions to post a property and to manage the listings', async () => {
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': { body: dashboard() },
    });
    const nav = navigation();
    const tree = await render(screenElement(AgencyDashboardScreen, nav));
    await settle();

    await press(tree.root, prs.dashboard.post);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty');
    await press(tree.root, prs.dashboard.manage);
    expect(nav.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'MyListings',
    });
  });

  it('says so when the agency profile is incomplete, with a way to retry', async () => {
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': {
        status: 404,
        body: { code: 'AGENCY_PROFILE_REQUIRED' },
      },
    });
    const tree = await render(screenElement(AgencyDashboardScreen));
    await settle();
    expect(allText(tree.root)).toContain(prs.add.agencyProfileRequired);
    expect(pressableWith(tree.root, prs.common.retry)).toBeTruthy();
  });

  it('is only for agency accounts and does not call the API for anyone else', async () => {
    mockAuth = { status: 'signedIn', user: { ...agencyUser, role: 'USER' } };
    mockApi(fetchMock, {});
    const tree = await render(screenElement(AgencyDashboardScreen));
    await settle();
    expect(allText(tree.root)).toContain(prs.dashboard.agenciesOnly);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {});
    const nav = navigation();
    const tree = await render(screenElement(AgencyDashboardScreen, nav));
    await settle();
    expect(allText(tree.root)).toContain(prs.dashboard.signInHint);
    expect(fetchMock).not.toHaveBeenCalled();
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });

  it('promotes a top listing from the dashboard and shows the result', async () => {
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': { body: dashboard() },
      ...payRoutes('SUCCESS'),
    });
    const tree = await render(screenElement(AgencyDashboardScreen));
    await settle();

    // The last "promote" button belongs to the second row (not featured): it opens the sheet for that listing.
    await act(async () => {
      tree.root
        .findAll(
          n =>
            typeof n.props.onPress === 'function' &&
            allText(n) === prs.dashboard.promote,
        )
        .at(-1)!
        .props.onPress();
    });
    await settle();
    expect(allText(tree.root)).toContain(prs.promotion.title);

    await press(tree.root, prs.checkout.pay); // "Ladder" is preselected
    await settle();
    expect(posts('/hesabpay/payments')[0].body).toEqual({
      purpose: 'LADDER',
      property_id: L2,
    });
    expect(openUrl).toHaveBeenCalledWith('https://pay.example/x');
    expect(allText(tree.root)).toContain(prs.checkout.success);
  });
});

describe('PromotionSheet', () => {
  const property = {
    id: L1,
    title: 'خانه حویلی',
    is_featured: false,
    featured_until: null,
  };

  it('stays closed without a listing', async () => {
    mockApi(fetchMock, {});
    const tree = await render(
      withQuery(<PromotionSheet property={null} onClose={jest.fn()} />),
    );
    await settle();
    expect(allText(tree.root)).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers both promotions at the server’s prices', async () => {
    mockApi(fetchMock, payRoutes('PENDING'));
    const tree = await render(
      withQuery(<PromotionSheet property={property} onClose={jest.fn()} />),
    );
    await settle();
    const text = allText(tree.root);
    expect(text).toContain('خانه حویلی');
    expect(text).toContain(prs.checkout.ladder);
    expect(text).toContain(prs.checkout.featured);
    expect(text).toContain(formatCurrency(50));
    expect(text).toContain(formatCurrency(100));
  });

  it('buys a featured ad with only the purpose and the listing id (the server sets the price)', async () => {
    mockApi(fetchMock, payRoutes('PENDING'));
    const tree = await render(
      withQuery(<PromotionSheet property={property} onClose={jest.fn()} />),
    );
    await settle();
    await press(tree.root, prs.checkout.featured);
    await press(tree.root, prs.checkout.pay);
    await settle();

    expect(posts('/hesabpay/payments')).toHaveLength(1);
    expect(posts('/hesabpay/payments')[0].body).toEqual({
      purpose: 'FEATURED_AD',
      property_id: L1,
    });
    // Waiting for the webhook: the person is told, and can re-check or reopen the page.
    const text = allText(tree.root);
    expect(text).toContain(prs.checkout.opened);
    expect(text).toContain(prs.checkout.checkStatus);
  });

  it('says when a featured ad is already running and that buying again adds days', async () => {
    mockApi(fetchMock, payRoutes('PENDING'));
    const tree = await render(
      withQuery(
        <PromotionSheet
          property={{
            ...property,
            is_featured: true,
            featured_until: '2026-10-20T00:00:00Z',
          }}
          onClose={jest.fn()}
        />,
      ),
    );
    await settle();
    expect(allText(tree.root)).toContain('تا ۲۰۲۶/۱۰/۲۰ ویژه است');
  });

  it('shows a failed payment and lets the person try again', async () => {
    mockApi(fetchMock, payRoutes('FAILED'));
    const tree = await render(
      withQuery(<PromotionSheet property={property} onClose={jest.fn()} />),
    );
    await settle();
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(allText(tree.root)).toContain(prs.checkout.failed);

    await press(tree.root, prs.common.retry);
    await settle();
    expect(allText(tree.root)).toContain(prs.promotion.choose); // back to choosing
  });

  it('reports a refused payment (not your listing, provider down) in the person’s language', async () => {
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': { body: PRICING },
      'POST /hesabpay/payments': { status: 502, body: {} },
    });
    const tree = await render(
      withQuery(<PromotionSheet property={property} onClose={jest.fn()} />),
    );
    await settle();
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(allText(tree.root)).toContain(prs.errors.paymentProvider);
  });

  it('closes from the close button', async () => {
    mockApi(fetchMock, payRoutes('PENDING'));
    const onClose = jest.fn();
    const tree = await render(
      withQuery(<PromotionSheet property={property} onClose={onClose} />),
    );
    await settle();
    await press(tree.root, prs.common.close);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('PropertyDetailsScreen: view counting', () => {
  const listing = (userId: string) => ({
    id: L1,
    user_id: userId,
    agency_id: null,
    agency_name: null,
    title: 'خانه',
    description: 'تازه',
    type: 'HOUSE_HAWILI',
    deal_type: 'SALE',
    price: 1000,
    currency: 'AFGHANI',
    area_sqm: 100,
    bedrooms: 2,
    bathrooms: 1,
    province: 'کابل',
    district: 'شهر نو',
    neighborhood: 'قلعه',
    address: 'سرک',
    lat: null,
    lng: null,
    images: [],
    status: 'ACTIVE',
    is_featured: false,
    featured_until: null,
    laddered_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  });
  const route = { params: { id: L1 } };

  it('counts one view when someone else opens the listing', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing('someone-else') },
      [`POST /properties/${L1}/view`]: { status: 204 },
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    // A re-render or a refetch of the same screen must not count again.
    await act(async () => {
      tree.update(screenElement(PropertyDetailsScreen, navigation(), route));
    });
    await settle();
    expect(posts(`/properties/${L1}/view`)).toHaveLength(1);
  });

  it('counts a signed-out visitor too', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing('someone-else') },
      [`POST /properties/${L1}/view`]: { status: 204 },
    });
    await render(screenElement(PropertyDetailsScreen, navigation(), route));
    await settle();
    expect(posts(`/properties/${L1}/view`)).toHaveLength(1);
  });

  it('does not count the owner looking at their own listing', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing(agencyUser.id) },
      [`POST /properties/${L1}/view`]: { status: 204 },
    });
    await render(screenElement(PropertyDetailsScreen, navigation(), route));
    await settle();
    expect(posts(`/properties/${L1}/view`)).toHaveLength(0);
  });

  it('waits for the session to be restored, so the owner is not counted while still loading', async () => {
    mockAuth = { status: 'loading', user: null };
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing(agencyUser.id) },
      [`POST /properties/${L1}/view`]: { status: 204 },
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    expect(posts(`/properties/${L1}/view`)).toHaveLength(0);

    mockAuth = { status: 'signedIn', user: agencyUser };
    await act(async () => {
      tree.update(screenElement(PropertyDetailsScreen, navigation(), route));
    });
    await settle();
    expect(posts(`/properties/${L1}/view`)).toHaveLength(0); // the owner, now known
  });

  it('still shows the listing when counting the view fails', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing('someone-else') },
      [`POST /properties/${L1}/view`]: { status: 500, body: {} },
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), route),
    );
    await settle();
    expect(allText(tree.root)).toContain('خانه');
  });

  it('lets the owner promote from the details page through the sheet', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${L1}`]: { body: listing(agencyUser.id) },
      ...payRoutes('PENDING'),
    });
    const nav = navigation();
    const tree = await render(screenElement(PropertyDetailsScreen, nav, route));
    await settle();
    await press(tree.root, prs.property.promote);
    await settle();
    expect(allText(tree.root)).toContain(prs.promotion.choose);
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
