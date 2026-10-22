import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';
import { SUBSCRIPTION_PLAN_BENEFITS, type Pricing } from '@bongah/shared-types';
import { ApiError } from '../src/api/client';
import { errorMessage } from '../src/api/errors';
import { APP_VERSION } from '../src/appInfo';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { planRank } from '../src/map/priority';
import { colors } from '../src/theme';
import { captureToasts } from '../test-utils/toasts';
import { planOffers } from '../src/payments/plans';
import app from '../app.json';
import pkg from '../package.json';
import {
  allText,
  callsTo,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};
let toasts: ReturnType<typeof captureToasts>;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import UpgradeScreen from '../src/screens/payments/UpgradeScreen';
import PhoneScreen from '../src/screens/auth/PhoneScreen';

const PRICING: Pricing = {
  currency: 'AFGHANI',
  subscription: {
    MONTHLY: 900,
    QUARTERLY: 2400,
    SEMIANNUAL: 3900,
    YEARLY: 6000,
  },
  subscription_list: {
    MONTHLY: 1000,
    QUARTERLY: 3000,
    SEMIANNUAL: 6000,
    YEARLY: 12000,
  },
  ladder: 50,
  featured_ad: 100,
  map_location: 30,
  featured_ad_days: 7,
  contact_credits: 40,
  contact_credits_per_pack: 10,
  plans: SUBSCRIPTION_PLAN_BENEFITS,
};

const person = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: 'احمد',
  avatar: null,
};
const agency = { ...person, id: 'a1', role: 'AGENCY' };

const navigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
});
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const act = ReactTestRenderer.act;

const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const mount = async <P extends object>(
  Screen: React.ComponentType<P>,
  nav = navigation(),
) => {
  const props = {
    navigation: nav,
    route: { params: undefined },
  } as unknown as P;
  const tree = await renderTree(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Screen {...props} />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  await settle();
  return { tree, nav };
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  toasts = captureToasts();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: agency };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

describe('planOffers', () => {
  it('works the discount out from the prices: 10, 20, 35 and 50 percent', () => {
    const offers = planOffers(PRICING);
    expect(offers.map(o => o.pkg)).toEqual([
      'MONTHLY',
      'QUARTERLY',
      'SEMIANNUAL',
      'YEARLY',
    ]);
    expect(offers.map(o => o.discountPercent)).toEqual([10, 20, 35, 50]);
    expect(offers.map(o => o.months)).toEqual([1, 3, 6, 12]);
    expect(offers.map(o => o.perMonth)).toEqual([900, 800, 650, 500]);
    expect(offers.map(o => o.saving)).toEqual([100, 600, 2100, 6000]);
  });

  it('marks the yearly plan, and only that one, as the best offer', () => {
    expect(
      planOffers(PRICING)
        .filter(o => o.best)
        .map(o => o.pkg),
    ).toEqual(['YEARLY']);
  });

  it('follows a price an admin changed instead of repeating the old promise', () => {
    const offers = planOffers({
      ...PRICING,
      subscription: { ...PRICING.subscription, YEARLY: 7200 },
    });
    expect(offers.find(o => o.pkg === 'YEARLY')?.discountPercent).toBe(40);
  });

  it('falls back to the advertised discount from a server that sends no list prices', () => {
    const older: Partial<Pricing> = { ...PRICING };
    delete older.subscription_list;
    const offers = planOffers(older as Pricing);
    expect(offers.map(o => o.discountPercent)).toEqual([10, 20, 35, 50]);
    expect(offers[3].listPrice).toBeCloseTo(12000, 5);
  });

  it('never shows a negative discount', () => {
    const offers = planOffers({
      ...PRICING,
      subscription: { ...PRICING.subscription, MONTHLY: 1500 },
    });
    expect(offers[0].discountPercent).toBe(0);
    expect(offers[0].saving).toBe(0);
  });
});

describe('planRank', () => {
  it('ranks a longer plan higher, the six-month one between quarterly and yearly', () => {
    const rank = (agency_plan: Parameters<typeof planRank>[0]['agency_plan']) =>
      planRank({ agency_plan });
    expect(rank(null)).toBe(0);
    expect(rank('MONTHLY')).toBeLessThan(rank('QUARTERLY'));
    expect(rank('QUARTERLY')).toBeLessThan(rank('SEMIANNUAL'));
    expect(rank('SEMIANNUAL')).toBeLessThan(rank('YEARLY'));
  });
});

describe('UpgradeScreen', () => {
  const ROUTES = {
    'GET /hesabpay/pricing': { body: PRICING },
  };

  it('offers the four plans, each with its discount in the words asked for', async () => {
    mockApi(fetchMock, ROUTES);
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    expect(text).toContain('ماهانه با ۱۰٪ تخفیف');
    expect(text).toContain('۳ ماهه با ۲۰٪ تخفیف');
    expect(text).toContain('۶ ماهه با ۳۵٪ تخفیف');
    expect(text).toContain('سالانه با ۵۰٪ تخفیف');
  });

  it('calls the yearly plan the best offer, once', async () => {
    mockApi(fetchMock, ROUTES);
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    expect(text.split('بهترین پیشنهاد')).toHaveLength(2);
    const yearly = tree.root.find(n => n.props.testID === 'plan-YEARLY');
    expect(allText(yearly)).toContain('بهترین پیشنهاد');
  });

  it('writes the price before the discount beside the price after it, with no Western digits', async () => {
    mockApi(fetchMock, ROUTES);
    const { tree } = await mount(UpgradeScreen);
    const yearly = allText(
      tree.root.find(n => n.props.testID === 'plan-YEARLY'),
    );
    expect(yearly).toContain('۱۲,۰۰۰');
    expect(yearly).toContain('۶,۰۰۰');
    expect(allText(tree.root)).not.toMatch(/[0-9]/);
  });

  it('buys the yearly plan by default and the one tapped otherwise', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/payments': {
        status: 201,
        body: {
          id: 'p1',
          purpose: 'SUBSCRIPTION',
          status: 'PENDING',
          amount: 6000,
          currency: 'AFGHANI',
          created_at: '2026-10-19T12:00:00Z',
          payment_url: 'https://pay.example/p1',
        },
      },
      'GET /hesabpay/payments/p1': {
        body: {
          id: 'p1',
          purpose: 'SUBSCRIPTION',
          status: 'PENDING',
          amount: 6000,
          currency: 'AFGHANI',
          created_at: '2026-10-19T12:00:00Z',
        },
      },
    });
    const { tree } = await mount(UpgradeScreen);
    await press(tree.root, prs.upgrade.pay.split('{{')[0].trim());
    await settle();
    const first = callsTo(fetchMock).find(c => c.method === 'POST');
    expect(first?.body).toEqual({
      purpose: 'SUBSCRIPTION',
      package_type: 'YEARLY',
    });
    expect(Linking.openURL).toHaveBeenCalledWith('https://pay.example/p1');
  });

  it('sends the plan that was tapped', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/payments': { status: 500, body: {} },
    });
    const { tree } = await mount(UpgradeScreen);
    await press(tree.root, 'ماهانه با ۱۰٪ تخفیف');
    expect(allText(tree.root)).toContain('۹۰۰');
    await press(tree.root, prs.upgrade.pay.split('{{')[0].trim());
    await settle();
    const post = callsTo(fetchMock).find(c => c.method === 'POST');
    expect(post?.body).toEqual({
      purpose: 'SUBSCRIPTION',
      package_type: 'MONTHLY',
    });
  });

  it('shows plans to a private account and, when asked to buy, says in a toast that it is for agencies', async () => {
    mockAuth = { status: 'signedIn', user: person };
    mockApi(fetchMock, ROUTES);
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    // The page is not rebuilt around the refusal: the plans are all there, and the only sentence above them is the
    // one about the free listing.
    expect(text).not.toContain(prs.upgrade.agenciesOnly);
    expect(text).toContain('سالانه با ۵۰٪ تخفیف');
    await press(tree.root, prs.upgrade.pay.split('{{')[0].trim());
    expect(toasts.messages).toEqual([prs.upgrade.agenciesOnly]);
    expect(callsTo(fetchMock).some(c => c.method === 'POST')).toBe(false);
  });

  it('keeps one sentence above the plans for everyone: the free listing of a private account', async () => {
    mockApi(fetchMock, ROUTES);
    for (const user of [
      agency,
      person,
      { ...person, welcome_listing_credits: 1 },
    ]) {
      mockAuth = { status: 'signedIn', user };
      const { tree } = await mount(UpgradeScreen);
      const text = allText(tree.root);
      expect(text).toContain(prs.upgrade.personalFree);
      // None of the older sentences and banners.
      expect(text).not.toContain(prs.upgrade.gift);
      expect(text).not.toContain(prs.upgrade.agenciesOnly);
      expect(text).not.toContain('هرچه مدت اشتراک بیشتر باشد');
    }
  });

  it('puts the launch-gifts banner at the top, in the words asked for, for an account that has not had the gifts', async () => {
    mockApi(fetchMock, ROUTES);
    const banner = 'تحفه‌های ویژه به مناسبت اولین بارگزاری برنامه بنگاه';
    expect(prs.upgrade.launchBanner).toBe(banner);
    for (const user of [
      { ...agency, first_subscription_bonus_available: true },
      agency, // an older account row that does not say: the gifts are still on offer
      person,
    ]) {
      mockAuth = { status: 'signedIn', user };
      const { tree } = await mount(UpgradeScreen);
      expect(allText(tree.root)).toContain(banner);
      // Above everything else on the page, the plans included.
      const first = tree.root
        .findAll(
          n =>
            n.props.testID === 'launch-gifts-banner' ||
            n.props.testID === 'plan-MONTHLY',
        )
        .map(n => n.props.testID);
      expect(first[0]).toBe('launch-gifts-banner');
    }
  });

  it('shows no banner and no gift lines once the gifts have been given', async () => {
    mockApi(fetchMock, ROUTES);
    mockAuth = {
      status: 'signedIn',
      user: { ...agency, first_subscription_bonus_available: false },
    };
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    expect(text).not.toContain(prs.upgrade.launchBanner);
    expect(text).not.toContain('آگهی هدیه');
    // The plans themselves are unchanged: their own listings and features still show.
    expect(allText(tree.root.findByProps({ testID: 'plan-YEARLY' }))).toContain(
      '۶۰ آگهی',
    );
  });

  it('promises nothing the server does not send: no banner and no feature lines from an older server', async () => {
    const { plans: _plans, ...older } = PRICING;
    mockApi(fetchMock, { 'GET /hesabpay/pricing': { body: older } });
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    expect(text).not.toContain(prs.upgrade.launchBanner);
    expect(text).not.toContain('آگهی هدیه');
    expect(
      tree.root.findAllByProps({ testID: 'plan-YEARLY-features' }),
    ).toHaveLength(0);
    expect(text).toContain('سالانه با ۵۰٪ تخفیف');
  });

  it.each([
    ['MONTHLY', '۸ آگهی', '۲ آگهی هدیه', '۱ کادر ویژه برای آگهی هدیه', false],
    [
      'QUARTERLY',
      '۱۸ آگهی',
      '۶ آگهی هدیه',
      '۳ کادر ویژه برای آگهی هدیه',
      true,
    ],
    [
      'SEMIANNUAL',
      '۳۰ آگهی',
      '۹ آگهی هدیه',
      '۶ کادر ویژه برای آگهی هدیه',
      true,
    ],
    [
      'YEARLY',
      '۶۰ آگهی',
      '۱۵ آگهی هدیه',
      '۱۲ کادر ویژه برای آگهی هدیه',
      true,
    ],
  ] as const)(
    '%s lists its listings, its gifts, accounting%s',
    async (plan, listings, gift, featured, portfolio) => {
      mockApi(fetchMock, ROUTES);
      const { tree } = await mount(UpgradeScreen);
      const text = allText(
        tree.root.findByProps({ testID: `plan-${plan}-features` }),
      );
      expect(text).toContain(listings);
      expect(text).toContain(gift);
      expect(text).toContain(featured);
      expect(text).toContain(prs.upgrade.feature.accounting);
      // The public portfolio comes with every plan except the one-month one.
      expect(text.includes(prs.upgrade.feature.portfolio)).toBe(portfolio);
      expect(text).not.toMatch(/[0-9]/);
    },
  );

  it('no longer says "up to 10 a month", and does not offer a gift the plan does not have', async () => {
    mockApi(fetchMock, ROUTES);
    const { tree } = await mount(UpgradeScreen);
    const text = allText(tree.root);
    expect(text).not.toContain('آگهی در ماه');
    expect(text).not.toContain(prs.upgrade.bonus.split('{{')[0].trim());
  });

  it('draws the 6-month plan with its own price, and leaves out a plan the server has no price for', async () => {
    mockApi(fetchMock, ROUTES);
    let { tree } = await mount(UpgradeScreen);
    const card = tree.root.findByProps({ testID: 'plan-SEMIANNUAL' });
    const text = allText(card);
    expect(text).toContain('۶ ماهه با ۳۵٪ تخفیف');
    expect(text).toContain('۳,۹۰۰');
    expect(text).toContain('۶,۰۰۰'); // the list price, struck through

    const { SEMIANNUAL: _gone, ...subscription } = PRICING.subscription;
    mockApi(fetchMock, {
      'GET /hesabpay/pricing': {
        body: { ...PRICING, subscription },
      },
    });
    ({ tree } = await mount(UpgradeScreen));
    expect(
      tree.root.findAllByProps({ testID: 'plan-SEMIANNUAL' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'plan-YEARLY' }).length,
    ).toBeGreaterThan(0);
  });

  it('offers the featured frame in its own gold card, leads to its packs, and has no ladder row', async () => {
    mockApi(fetchMock, ROUTES);
    const { tree, nav } = await mount(UpgradeScreen);
    const featured = tree.root.findByProps({ testID: 'promo-featured' });
    expect(tree.root.findAllByProps({ testID: 'promo-ladder' })).toHaveLength(
      0,
    );
    expect(allText(tree.root)).not.toContain(prs.upgrade.ladderTitle);
    expect(allText(featured)).toContain(prs.frame.title);
    expect(allText(featured)).toContain(prs.upgrade.featuredBadge);
    expect(allText(featured)).toContain(
      '۷ روز با نشان و کادر ویژه به بالای فهرست نمایش داده می‌شود',
    );
    // The featured card has its own gold frame.
    const frame = JSON.stringify(featured.props.style);
    expect(frame).toContain(colors.accentBright);

    await act(async () => featured.props.onPress());
    expect(nav.navigate).toHaveBeenLastCalledWith('Checkout');
  });

  it('asks a visitor to sign in first', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, ROUTES);
    const { tree, nav } = await mount(UpgradeScreen);
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });

  it('says so when the prices cannot be loaded, and tries again on request', async () => {
    mockApi(fetchMock, { 'GET /hesabpay/pricing': { status: 500, body: {} } });
    const { tree } = await mount(UpgradeScreen);
    expect(allText(tree.root)).toContain(prs.checkout.pricesFailed);
    mockApi(fetchMock, ROUTES);
    await press(tree.root, prs.common.retry);
    await settle();
    expect(allText(tree.root)).toContain('سالانه با ۵۰٪ تخفیف');
  });

  it('is named in the app as «ارتقای حساب و خرید اشتراک», in both languages', () => {
    expect(prs.nav.upgrade).toBe('ارتقای حساب و خرید اشتراک');
    expect(ps.nav.upgrade.length).toBeGreaterThan(0);
    for (const plan of [
      'MONTHLY',
      'QUARTERLY',
      'SEMIANNUAL',
      'YEARLY',
    ] as const) {
      expect(prs.upgrade.plan[plan]).toContain('{{percent}}');
      expect(ps.upgrade.plan[plan]).toContain('{{percent}}');
      expect(prs.package[plan].length).toBeGreaterThan(0);
      expect(ps.package[plan].length).toBeGreaterThan(0);
    }
  });
});

describe('the code goes to WhatsApp', () => {
  it('tells the person where the code is sent, in the sign-in screen', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree } = await mount(PhoneScreen);
    const text = allText(tree.root);
    expect(text).toContain('واتساپ');
    expect(text).not.toContain('پیامک');
  });

  it('answers a failed delivery with a WhatsApp sentence, in both languages', () => {
    const failed = new ApiError('http', 503, {});
    expect(errorMessage(failed, i18next.t)).toBe(prs.errors.otpSendFailed);
    expect(prs.errors.otpSendFailed).toContain('واتساپ');
    expect(ps.errors.otpSendFailed).toContain('واټساپ');
  });
});

describe("the plan's listing limit", () => {
  const reached = (body: object) =>
    errorMessage(new ApiError('http', 403, body), i18next.t);

  it("says the plan's listings are used up, with no next-month date", () => {
    const message = reached({ code: 'AGENCY_LISTING_LIMIT_REACHED', limit: 8 });
    expect(message).toBe(prs.add.agencyQuotaReached.replace('{{limit}}', '۸'));
    expect(message).not.toContain('ماه');
  });

  it('still answers an older server, which counts per month, with its reset date', () => {
    const message = reached({
      code: 'AGENCY_LISTING_LIMIT_REACHED',
      limit: 10,
      resets_at: '2026-11-01T00:00:00.000Z',
    });
    expect(message).toContain('در این ماه');
  });

  it('has the message in Pashto too', () => {
    expect(ps.add.agencyQuotaReached).toContain('{{limit}}');
  });
});

describe('the version', () => {
  it('is 1.2.4 in the package, in app.json and in the app', () => {
    expect(pkg.version).toBe('1.2.4');
    expect(app.version).toBe('1.2.4');
    expect(APP_VERSION).toBe('1.2.4');
  });
});
