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
    { size: 1, price: 100, list_price: 100, discount_percent: 0 },
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
  prs.frame.bundle.replace('{{count}}', formatNumber(size, 0));
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

describe('the featured-frame packs on the checkout screen', () => {
  it('shows only the frame packs, in one framed panel: no tabs, no subscription, no listing list and no ladder', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount();
    const panel = tree.root.findByProps({ testID: 'featured-panel' });
    const text = allText(panel);
    expect(text).toContain(prs.frame.title);
    // The single frame and the packs of 3, 5, 10 and 20, with their discounts.
    for (const size of [3, 5, 10, 20])
      expect(text).toContain(bundleTitle(size));
    for (const percent of ['۱۰', '۲۰', '۳۵', '۴۵']) {
      expect(text).toContain(`${percent}٪ تخفیف`);
    }
    // Nothing but the panel, the amount and the pay button: no switcher between a subscription and the frames.
    const all = allText(tree.root);
    expect(all).not.toContain(prs.checkout.tabSubscription);
    expect(all).not.toContain(prs.checkout.tabPromotion);
    expect(all).not.toContain(prs.checkout.subscriptionHelp);
    expect(all).not.toContain(prs.checkout.agenciesOnly);
    for (const plan of [
      'MONTHLY',
      'QUARTERLY',
      'SEMIANNUAL',
      'YEARLY',
    ] as const)
      expect(all).not.toContain(prs.package[plan]);
    expect(all).not.toContain('نردبان');
    expect(all).not.toContain(prs.checkout.selectListing);
    expect(all).not.toContain(listing.title);
    expect(callsTo(fetchMock).map(c => c.path)).not.toContain(
      '/properties/mine',
    );
    // What a framed listing gets, said in the product's own words.
    expect(text).toContain(
      '۷ روز با نشان و کادر ویژه به بالای فهرست نمایش داده می‌شود',
    );
  });

  it('is not a way to buy a subscription, whoever opens it', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount();
    await press(tree.root, prs.checkout.pay);
    await settle();
    const bodies = posts('/hesabpay/payments').map(c => c.body);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty('package_type');
    expect(bodies[0]).toMatchObject({ purpose: 'FEATURED_CREDITS' });
  });

  it('lists a single frame and the packs of 3, 5, 10 and 20, at 100, 270, 400, 650 and 1,100', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount();
    const text = allText(tree.root.findByProps({ testID: 'featured-panel' }));
    for (const price of ['۱۰۰', '۲۷۰', '۴۰۰', '۶۵۰', '۱,۱۰۰']) {
      expect(text).toContain(price);
    }
    expect(text).not.toMatch(/[0-9]/);
    // The single frame is the full price: it says what it is, and promises no discount.
    expect(text).not.toMatch(/(^|\s)۰٪ تخفیف/);
    // The single frame first, then the packs from the smallest.
    const positions = [3, 5, 10, 20].map(n => text.indexOf(bundleTitle(n)));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.indexOf(prs.frame.title)).toBeLessThan(positions[0]);
  });

  it('starts on the single frame and buys it without choosing a listing', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/payments': {
        status: 201,
        body: { ...PAID, amount: 100 },
      },
      'GET /hesabpay/payments/pay-1': { body: { ...PAID, amount: 100 } },
    });
    const tree = await mount();
    expect(allText(tree.root)).toMatch(
      new RegExp(`${prs.checkout.amount}\\s*:\\s*۱۰۰`),
    );
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(posts('/hesabpay/payments').map(c => c.body)).toEqual([
      { purpose: 'FEATURED_CREDITS', bundle_size: 1 },
    ]);
    expect(Linking.openURL).toHaveBeenCalledWith('https://pay.example/x');
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
      const tree = await mount();
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

  it('ignores a tab, a listing or a ladder asked for in the route: it never sells any of them', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await mount({
      tab: 'subscription',
      purpose: 'LADDER',
      propertyId: L1,
    });
    expect(allText(tree.root)).not.toContain('نردبان');
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(posts('/hesabpay/payments').map(c => c.body)).toEqual([
      { purpose: 'FEATURED_CREDITS', bundle_size: 1 },
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
    const tree = await mount();
    expect(allText(tree.root)).not.toContain(bundleTitle(7));
    expect(allText(tree.root)).toContain(bundleTitle(20));
  });

  it('shows no packs, and nothing to pay for, when the server sends none', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'GET /hesabpay/pricing': {
        body: { ...PRICING, featured_bundles: undefined },
      },
    });
    const tree = await mount();
    expect(allText(tree.root)).not.toContain(bundleTitle(5));
    expect(allText(tree.root)).toContain(prs.frame.title);
    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(posts('/hesabpay/payments')).toHaveLength(0);
  });

  it('says how many frames the person already holds, and offers no way to spend them here', async () => {
    mockApi(fetchMock, ROUTES);
    mockAuth = {
      status: 'signedIn',
      user: { ...agency, featured_credits: 2 },
      refreshUser,
    };
    const tree = await mount();
    expect(allText(tree.root)).toContain(
      prs.frame.credits.replace('{{count}}', '۲'),
    );
    expect(allText(tree.root)).not.toContain(prs.frame.useCredit);
    expect(posts('/hesabpay/featured-credits/use')).toHaveLength(0);
  });
});
