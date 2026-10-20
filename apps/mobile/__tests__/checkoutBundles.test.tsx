import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Pricing } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render,
} from '../test-utils';
import { captureToasts } from '../test-utils/toasts';

const fetchMock = jest.fn();
const refreshUser = jest.fn(async () => undefined);
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screen picks it up.
import CheckoutScreen from '../src/screens/payments/CheckoutScreen';

const act = ReactTestRenderer.act;
const L1 = '11111111-1111-4111-8111-111111111111';
const PRICING: Pricing = {
  currency: 'AFGHANI',
  subscription: {
    MONTHLY: 900,
    QUARTERLY: 2400,
    SEMIANNUAL: 3900,
    YEARLY: 6000,
  },
  ladder: 50,
  featured_ad: 100,
  map_location: 30,
  featured_ad_days: 7,
  contact_credits: 40,
  contact_credits_per_pack: 10,
  featured_bundles: [
    { size: 3, price: 270, list_price: 300, discount_percent: 10 },
    { size: 5, price: 400, list_price: 500, discount_percent: 20 },
    { size: 10, price: 650, list_price: 1000, discount_percent: 35 },
    { size: 20, price: 1100, list_price: 2000, discount_percent: 45 },
  ],
};
const listing = {
  id: L1,
  title: 'خانه حویلی',
  status: 'ACTIVE',
  price: 5200000,
  currency: 'AFGHANI',
};
const agency = { id: 'a1', role: 'AGENCY', phone_number: '+93701234567' };
const PAID = {
  id: 'pay-1',
  status: 'PENDING',
  amount: 400,
  currency: 'AFGHANI',
  payment_url: 'https://pay.example/x',
};
const ROUTES = {
  'GET /hesabpay/pricing': { body: PRICING },
  'GET /properties/mine': {
    body: {
      data: [listing],
      meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
    },
  },
};

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
let toasts: ReturnType<typeof captureToasts>;
const mount = async (params?: object) => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const props = {
    navigation: nav,
    route: { params },
  } as unknown as React.ComponentProps<typeof CheckoutScreen>;
  const tree = await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CheckoutScreen {...props} />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  await settle();
  return tree;
};
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
const bundleTitle = (size: number) =>
  prs.checkout.featuredBundle.replace('{{count}}', formatNumber(size, 0));
const posts = (path: string) =>
  callsTo(fetchMock).filter(c => c.method === 'POST' && c.path === path);

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  toasts = captureToasts();
  fetchMock.mockReset();
  refreshUser.mockClear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: agency, refreshUser };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(async () => {
  toasts.restore();
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

describe('the featured-ad bundles on the checkout screen', () => {
  it('puts the single ad and the four bundles in one framed panel, apart from the ladder', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount({ tab: 'promotion' });
    const panel = tree.root.findByProps({ testID: 'featured-panel' });
    const text = allText(panel);
    expect(text).toContain(prs.checkout.featured);
    for (const size of [3, 5, 10, 20])
      expect(text).toContain(bundleTitle(size));
    for (const percent of ['۱۰', '۲۰', '۳۵', '۴۵']) {
      expect(text).toContain(`${percent}٪ تخفیف`);
    }
    expect(text).not.toContain(prs.checkout.ladder);
    // What the featured listing gets: a frame, the top of the list and the gold pin on the map.
    expect(text).toContain('جایگاه بالای فهرست');
    expect(text).toContain('نشان طلایی');
  });

  it('lists the offers from one listing to twenty, at 100, 270, 400, 650 and 1,100', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount({ tab: 'promotion' });
    const text = allText(tree.root.findByProps({ testID: 'featured-panel' }));
    for (const price of ['۱۰۰', '۲۷۰', '۴۰۰', '۶۵۰', '۱,۱۰۰']) {
      expect(text).toContain(price);
    }
    expect(text).not.toMatch(/[0-9]/);
    // Smallest bundle first.
    const order = [3, 5, 10, 20].map(n => text.indexOf(bundleTitle(n)));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it.each([
    [3, '۲۷۰', 270],
    [5, '۴۰۰', 400],
    [10, '۶۵۰', 650],
    [20, '۱,۱۰۰', 1100],
  ])(
    'buys the %i-pack without choosing a listing, sending only the purpose and the size',
    async (size, shown, amount) => {
      mockApi(fetchMock, {
        ...ROUTES,
        'POST /hesabpay/payments': { status: 201, body: { ...PAID, amount } },
        'GET /hesabpay/payments/pay-1': { body: { ...PAID, amount } },
      });
      const tree = await mount({ tab: 'promotion' });
      await press(tree.root, bundleTitle(size));
      expect(allText(tree.root)).toMatch(
        new RegExp(`${prs.checkout.amount}\\s*:\\s*${shown}`),
      );
      await press(tree.root, prs.checkout.pay);
      await settle();
      expect(posts('/hesabpay/payments').map(c => c.body)).toEqual([
        { purpose: 'FEATURED_CREDITS', bundle_size: size },
      ]);
      expect(Linking.openURL).toHaveBeenCalledWith('https://pay.example/x');
    },
  );

  it('sells the single featured ad for 100 on a chosen listing', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/payments': {
        status: 201,
        body: { ...PAID, amount: 100 },
      },
      'GET /hesabpay/payments/pay-1': { body: { ...PAID, amount: 100 } },
    });
    const tree = await mount({
      tab: 'promotion',
      purpose: 'FEATURED_AD',
      propertyId: L1,
    });
    expect(allText(tree.root)).toMatch(
      new RegExp(`${prs.checkout.amount}\\s*:\\s*۱۰۰`),
    );
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(posts('/hesabpay/payments').map(c => c.body)).toEqual([
      { purpose: 'FEATURED_AD', property_id: L1 },
    ]);
  });

  it('leaves out a size the API would refuse', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'GET /hesabpay/pricing': {
        body: {
          ...PRICING,
          featured_bundles: [
            ...(PRICING.featured_bundles ?? []),
            { size: 7, price: 600, list_price: 700, discount_percent: 14 },
          ],
        },
      },
    });
    const tree = await mount({ tab: 'promotion' });
    expect(allText(tree.root)).not.toContain(bundleTitle(7));
    expect(allText(tree.root)).toContain(bundleTitle(20));
  });

  it('shows no bundles when the server sends none', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'GET /hesabpay/pricing': {
        body: { ...PRICING, featured_bundles: undefined },
      },
    });
    const tree = await mount({ tab: 'promotion' });
    expect(allText(tree.root)).not.toContain(bundleTitle(5));
    expect(allText(tree.root)).toContain(prs.checkout.featured);
  });
});

describe('spending a featured-ad credit', () => {
  const withCredits = (n: number) => {
    mockAuth = {
      status: 'signedIn',
      user: { ...agency, featured_credits: n },
      refreshUser,
    };
  };

  it('offers the credit only to someone who has one, for a featured ad', async () => {
    mockApi(fetchMock, ROUTES);
    withCredits(0);
    let tree = await mount({ tab: 'promotion', purpose: 'FEATURED_AD' });
    expect(allText(tree.root)).not.toContain(prs.checkout.useCredit);

    withCredits(2);
    tree = await mount({ tab: 'promotion', purpose: 'FEATURED_AD' });
    expect(allText(tree.root)).toContain(prs.checkout.useCredit);
    expect(allText(tree.root)).toContain(
      prs.checkout.featuredCredits.replace('{{count}}', '۲'),
    );

    tree = await mount({ tab: 'promotion', purpose: 'LADDER' });
    expect(allText(tree.root)).not.toContain(prs.checkout.useCredit);
  });

  it('spends one credit on the chosen listing, says so, and refreshes the account', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/featured-credits/use': {
        body: { featured_until: '2026-10-26T08:00:00Z', featured_credits: 1 },
      },
    });
    withCredits(2);
    const tree = await mount({
      tab: 'promotion',
      purpose: 'FEATURED_AD',
      propertyId: L1,
    });
    await press(tree.root, prs.checkout.useCredit);
    await settle();
    expect(posts('/hesabpay/featured-credits/use').map(c => c.body)).toEqual([
      { property_id: L1 },
    ]);
    expect(toasts.calls[0][0]).toBe(
      prs.checkout.creditUsed.replace('{{count}}', '۱'),
    );
    expect(toasts.calls[0][1]).toBe('success');
    expect(refreshUser).toHaveBeenCalled();
  });

  it('asks for a listing first when none is chosen, without calling the server', async () => {
    mockApi(fetchMock, ROUTES);
    withCredits(1);
    const tree = await mount({ tab: 'promotion', purpose: 'FEATURED_AD' });
    await press(tree.root, prs.checkout.useCredit);
    await settle();
    expect(toasts.messages).toEqual([prs.checkout.selectListing]);
    expect(posts('/hesabpay/featured-credits/use')).toHaveLength(0);
  });

  it('says in a toast when the server has no credit left', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/featured-credits/use': {
        status: 409,
        body: { code: 'NO_FEATURED_CREDITS' },
      },
    });
    withCredits(1);
    const tree = await mount({
      tab: 'promotion',
      purpose: 'FEATURED_AD',
      propertyId: L1,
    });
    await press(tree.root, prs.checkout.useCredit);
    await settle();
    expect(toasts.messages).toEqual([prs.errors.noFeaturedCredits]);
  });
});
