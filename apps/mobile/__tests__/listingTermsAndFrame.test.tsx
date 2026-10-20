import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import {
  allText,
  callsTo,
  inputLabelled,
  mapParts,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';
import { captureToasts } from '../test-utils/toasts';

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () =>
  require('../test-utils/navMock').navigationModule(),
);
// The map service is asked a second apart for real; a test has no use for the wait.
jest.mock('../src/config', () => ({
  ...jest.requireActual('../src/config'),
  GEOCODER_GAP_MS: 5,
}));
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import AddPropertyScreen from '../src/screens/property/AddPropertyScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';
import PropertyCard from '../src/components/PropertyCard';

const act = ReactTestRenderer.act;
const ID = '11111111-1111-4111-8111-111111111111';
const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: null,
  avatar: null,
};
const PRICING = {
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
  featured_bundles: [],
};
const listing = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
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
const screenElement = <P extends object>(
  Screen: React.ComponentType<P>,
  nav: ReturnType<typeof navigation> = navigation(),
  route: object = {},
) => {
  const props = {
    navigation: nav,
    route: { params: undefined, ...route },
  } as unknown as P;
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Screen {...props} />
    </QueryClientProvider>
  );
};

beforeAll(async () => {
  await initI18n();
});
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
let toasts: ReturnType<typeof captureToasts>;
beforeEach(() => {
  toasts = captureToasts();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = {
    status: 'signedIn',
    user,
    refreshUser: jest.fn(async () => undefined),
  };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
afterEach(async () => {
  toasts.restore();
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
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
const type = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  text: string,
) =>
  act(async () => {
    inputLabelled(root, label).props.onChangeText(text);
  });
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
const posted = () =>
  callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');
const posts = (path: string) =>
  callsTo(fetchMock).filter(c => c.method === 'POST' && c.path === path);
const switchOf = (root: ReactTestRenderer.ReactTestInstance) =>
  root.find(
    n =>
      n.props.testID === 'frame-switch' &&
      typeof n.props.onValueChange === 'function',
  );

/** Everything the form needs, written as an address (no pin), for a deal whose price box has the given label. */
async function fill(
  root: ReactTestRenderer.ReactTestInstance,
  priceLabel: string,
) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.descriptionLabel, 'خانه نو با دو اتاق خواب');
  await type(root, priceLabel, '1200000');
  await type(root, prs.add.area, '120');
  await plus(root, prs.add.bedrooms);
  await plus(root, prs.add.bathrooms);
  await type(root, prs.add.address, 'کابل، ناحیه ۵، پهلوی شفاخانه ABC');
  await press(root, prs.home.selectProvince);
  await press(root, 'کابل');
}
const ROUTES = {
  'POST /properties': { status: 201, body: listing() },
  'GET /hesabpay/pricing': { body: PRICING },
};

describe('the price label follows the deal', () => {
  it('says sale price, monthly rent or mortgage amount', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    expect(inputLabelled(tree.root, prs.dealPrice.SALE)).toBeTruthy();
    expect(prs.dealPrice.SALE).toBe('قیمت فروش');

    await press(tree.root, prs.dealType.RENT);
    expect(inputLabelled(tree.root, prs.dealPrice.RENT)).toBeTruthy();
    expect(prs.dealPrice.RENT).toBe('قیمت کرایه ماهانه');

    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    expect(inputLabelled(tree.root, prs.dealPrice.MORTGAGE_GROWI)).toBeTruthy();
    expect(prs.dealPrice.MORTGAGE_GROWI).toBe('مبلغ گروی');
  });

  it('asks for the length of a mortgage, and only for a mortgage', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    expect(() => inputLabelled(tree.root, prs.mortgage.label)).toThrow();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    expect(inputLabelled(tree.root, prs.mortgage.label)).toBeTruthy();
    expect(prs.mortgage.label).toBe('مدت گروی بر حسب ماه یا سال');
    await press(tree.root, prs.dealType.SALE);
    expect(() => inputLabelled(tree.root, prs.mortgage.label)).toThrow();
  });
});

describe('the mortgage length and the price terms are sent', () => {
  it('will not send a mortgage without its length, and says where it is missing', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    await fill(tree.root, prs.dealPrice.MORTGAGE_GROWI);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeUndefined();
    expect(allText(tree.root)).toContain(prs.add.required);
  });

  it('sends years as months, and months as they are', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    await fill(tree.root, prs.dealPrice.MORTGAGE_GROWI);
    await type(tree.root, prs.mortgage.label, '۲');
    await press(tree.root, prs.mortgage.year);
    // The months it comes to are written under the box.
    expect(allText(tree.root)).toContain(
      prs.mortgage.equals.replace('{{months}}', '۲۴'),
    );
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({
      deal_type: 'MORTGAGE_GROWI',
      mortgage_months: 24,
    });
    expect(posted()?.body).not.toHaveProperty('price_terms');
  });

  it('reads a number of months', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    await fill(tree.root, prs.dealPrice.MORTGAGE_GROWI);
    await type(tree.root, prs.mortgage.label, '18');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body.mortgage_months).toBe(18);
  });

  it('refuses a part of a month and a length beyond fifty years', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    await fill(tree.root, prs.dealPrice.MORTGAGE_GROWI);
    await type(tree.root, prs.mortgage.label, '1.5');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeUndefined();
    expect(allText(tree.root)).toContain(prs.mortgage.error);
    await type(tree.root, prs.mortgage.label, '51');
    await press(tree.root, prs.mortgage.year);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeUndefined();
  });

  it('sends no length for a rent, even if one was typed for a mortgage first', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    await press(tree.root, prs.dealType.MORTGAGE_GROWI);
    await type(tree.root, prs.mortgage.label, '12');
    await press(tree.root, prs.dealType.RENT);
    await fill(tree.root, prs.dealPrice.RENT);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body).toMatchObject({ deal_type: 'RENT' });
    expect(posted()?.body).not.toHaveProperty('mortgage_months');
  });

  it('offers fixed, negotiable or neither, and sends the choice', async () => {
    mockApi(fetchMock, ROUTES);
    expect(prs.priceTerms.FIXED).toBe('مقطوع');
    expect(prs.priceTerms.NEGOTIABLE).toBe('جورآمد (قابل توافق)');
    const first = await render(screenElement(AddPropertyScreen));
    await settle();
    await fill(first.root, prs.dealPrice.SALE);
    await press(first.root, prs.priceTerms.FIXED);
    await press(first.root, prs.add.submit);
    await settle();
    expect(posted()?.body.price_terms).toBe('FIXED');

    fetchMock.mockClear();
    const second = await render(screenElement(AddPropertyScreen));
    await settle();
    await fill(second.root, prs.dealPrice.SALE);
    await press(second.root, prs.priceTerms.NEGOTIABLE);
    await press(second.root, prs.add.submit);
    await settle();
    expect(posted()?.body.price_terms).toBe('NEGOTIABLE');

    fetchMock.mockClear();
    const third = await render(screenElement(AddPropertyScreen));
    await settle();
    await fill(third.root, prs.dealPrice.SALE);
    await press(third.root, prs.priceTerms.FIXED);
    await press(third.root, prs.priceTerms.NONE); // taken back
    await press(third.root, prs.add.submit);
    await settle();
    expect(posted()?.body).not.toHaveProperty('price_terms');
  });

  it('fills an edited mortgage back in (whole years as years) and clears a term that is taken off', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${ID}`]: {
        body: listing({
          deal_type: 'MORTGAGE_GROWI',
          mortgage_months: 24,
          price_terms: 'NEGOTIABLE',
        }),
      },
      [`PATCH /properties/${ID}`]: { body: listing() },
      'GET /hesabpay/pricing': { body: PRICING },
    });
    const nav = navigation();
    const tree = await render(
      screenElement(AddPropertyScreen, nav, { params: { propertyId: ID } }),
    );
    await settle();
    expect(inputLabelled(tree.root, prs.mortgage.label).props.value).toMatch(
      /[2۲]/,
    );
    await press(tree.root, prs.priceTerms.NONE);
    await press(tree.root, prs.add.save);
    await settle();
    const patch = callsTo(fetchMock).find(c => c.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      mortgage_months: 24,
      price_terms: null,
    });
  });
});

describe('the featured frame switch on the form', () => {
  const answerUse = (credits = 1) => ({
    'POST /hesabpay/featured-credits/use': {
      body: {
        id: ID,
        is_featured: true,
        featured_until: '2026-10-30T00:00:00Z',
        featured_credits: credits,
      },
    },
  });

  it('is the last thing on the form and is off, and a form that is only filled in makes no payment call', async () => {
    mockApi(fetchMock, ROUTES);
    const tree = await render(screenElement(AddPropertyScreen));
    await settle();
    expect(switchOf(tree.root).props.value).toBe(false);
    expect(prs.frame.toggle).toBe('پوشش با کادر ویژه ({{days}} روزه)');
    expect(allText(tree.root)).toContain('پوشش با کادر ویژه (۷ روزه)');
    expect(
      callsTo(fetchMock).filter(c => c.path.includes('hesabpay')),
    ).toHaveLength(0);
  });

  it('does nothing about a frame while it is off', async () => {
    mockApi(fetchMock, { ...ROUTES, ...answerUse() });
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    await fill(tree.root, prs.dealPrice.SALE);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
    expect(posts('/hesabpay/featured-credits/use')).toHaveLength(0);
    expect(posts('/hesabpay/payments')).toHaveLength(0);
  });

  it('spends a credit on the new listing right after the save, when there is one', async () => {
    mockAuth = { ...mockAuth, user: { ...user, featured_credits: 2 } };
    mockApi(fetchMock, { ...ROUTES, ...answerUse(1) });
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    expect(allText(tree.root)).toContain(
      prs.frame.toggleCredit.replace('{{count}}', '۲'),
    );
    await fill(tree.root, prs.dealPrice.SALE);
    await act(async () => switchOf(tree.root).props.onValueChange(true));
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posts('/hesabpay/featured-credits/use')[0]?.body).toEqual({
      property_id: ID,
    });
    expect(posts('/hesabpay/payments')).toHaveLength(0);
    expect(toasts.messages).toContain(
      prs.checkout.creditUsed.replace('{{count}}', '۱'),
    );
  });

  it('with no credit, pays for the frame in the sheet, after the save, and goes to the listing when done', async () => {
    mockApi(fetchMock, {
      ...ROUTES,
      'POST /hesabpay/payments': {
        status: 201,
        body: {
          id: 'p1',
          payment_url: 'https://pay.example/p1',
          amount: 100,
          currency: 'AFGHANI',
          status: 'PENDING',
        },
      },
      'GET /hesabpay/payments/p1': {
        body: { id: 'p1', status: 'SUCCESS', amount: 100, currency: 'AFGHANI' },
      },
    });
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    await fill(tree.root, prs.dealPrice.SALE);
    await act(async () => switchOf(tree.root).props.onValueChange(true));
    await settle();
    // The price is said under the switch once it is on.
    expect(allText(tree.root)).toContain('۱۰۰');
    await press(tree.root, prs.add.submit);
    await settle();
    // The listing is saved; the sheet now shows the payment step, not the form, and has not left yet.
    expect(posted()).toBeDefined();
    expect(allText(tree.root)).toContain(prs.frame.payTitle);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(posts('/hesabpay/payments')).toHaveLength(0);

    await press(tree.root, prs.checkout.pay);
    await settle();
    expect(posts('/hesabpay/payments')[0]?.body).toEqual({
      purpose: 'FEATURED_AD',
      property_id: ID,
    });
    expect(Linking.openURL).toHaveBeenCalledWith('https://pay.example/p1');
  });

  it('lets the person skip the payment and keeps the saved listing', async () => {
    mockApi(fetchMock, ROUTES);
    const nav = navigation();
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    await fill(tree.root, prs.dealPrice.SALE);
    await act(async () => switchOf(tree.root).props.onValueChange(true));
    await press(tree.root, prs.add.submit);
    await settle();
    await press(tree.root, prs.frame.skip);
    await settle();
    expect(posts('/properties')).toHaveLength(1);
    expect(posts('/hesabpay/payments')).toHaveLength(0);
  });

  it('is on the edit form too, and says a running frame is extended', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${ID}`]: {
        body: listing({
          is_featured: true,
          featured_until: '2027-01-01T00:00:00Z',
        }),
      },
      'GET /hesabpay/pricing': { body: PRICING },
    });
    const tree = await render(
      screenElement(AddPropertyScreen, navigation(), {
        params: { propertyId: ID },
      }),
    );
    await settle();
    expect(switchOf(tree.root).props.value).toBe(false);
    expect(allText(tree.root)).toContain(
      prs.frame.toggleExtends.split('{{')[0].trim(),
    );
  });
});

describe('the details page says what the price is for', () => {
  const show = async (overrides: Record<string, unknown>, extra = {}) => {
    mockApi(fetchMock, {
      [`GET /properties/${ID}`]: { body: listing(overrides) },
      ...extra,
    });
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), {
        params: { id: ID },
      }),
    );
    await settle();
    return tree;
  };

  it.each([
    ['SALE', 'قیمت فروش'],
    ['RENT', 'قیمت کرایه ماهانه'],
    ['MORTGAGE_GROWI', 'مبلغ گروی'],
  ])('writes the %s price caption as «%s»', async (deal, caption) => {
    const tree = await show({ deal_type: deal });
    const text = allText(tree.root);
    expect(text).toContain(caption);
    // The old one-word caption is not left beside it.
    expect(text).not.toContain(`${prs.add.price} ۱,۰۰۰`);
  });

  it('shows the length of a mortgage and the terms of the price', async () => {
    const tree = await show({
      deal_type: 'MORTGAGE_GROWI',
      mortgage_months: 30,
      price_terms: 'FIXED',
    });
    const text = allText(tree.root);
    expect(text).toContain(prs.mortgage.forDuration);
    expect(text).toContain(
      prs.mortgage.yearsMonths
        .replace('{{years}}', '۲')
        .replace('{{months}}', '۶'),
    );
    expect(text).toContain(prs.priceTerms.FIXED);
  });

  it('shows no terms and no length when the owner gave none', async () => {
    const tree = await show({ deal_type: 'RENT' });
    const text = allText(tree.root);
    expect(text).not.toContain(prs.mortgage.forDuration);
    expect(text).not.toContain(prs.priceTerms.FIXED);
    expect(text).not.toContain(prs.priceTerms.NEGOTIABLE);
  });

  it('does not say the province, district or address twice', async () => {
    const tree = await show({ lat: 34.5, lng: 69.1 });
    const text = allText(tree.root);
    const times = (needle: string) => text.split(needle).length - 1;
    expect(times('کابل')).toBe(1); // under the title only
    expect(times('شهر نو')).toBe(1);
    expect(times('سرک چهارم')).toBe(1); // the one place the card says the address
    expect(text).toContain('قلعه فتح‌الله'); // what the title line does not say stays in the card
  });
});

describe('a listing posted without a pin still shows where it is', () => {
  const search = (hits: unknown[] | 'down') => {
    mockApi(fetchMock, { [`GET /properties/${ID}`]: { body: listing() } });
    const api = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (!url.startsWith('https://nominatim.openstreetmap.org/'))
        return api(url, init);
      if (hits === 'down') throw new Error('offline');
      return { ok: true, status: 200, json: async () => hits };
    });
  };
  /** Opens the page and waits until it has settled on a map or on "no exact location" (the searches run a moment apart). */
  const open = async () => {
    const tree = await render(
      screenElement(PropertyDetailsScreen, navigation(), {
        params: { id: ID },
      }),
    );
    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 50));
      });
      if (
        mapParts(tree.root, 'Map').length > 0 ||
        allText(tree.root).includes(prs.map.noExact)
      )
        break;
    }
    return tree;
  };

  it('puts the address on the map, with a note that it is approximate', async () => {
    search([
      {
        lat: '34.53',
        lon: '69.17',
        boundingbox: ['34.5', '34.55', '69.1', '69.2'],
      },
    ]);
    const tree = await open();
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
    const text = allText(tree.root);
    expect(text).toContain(prs.property.approxLocation);
    expect(text).not.toContain(prs.map.noExact);
    const asked = callsTo(fetchMock).find(c => c.path.endsWith('/search'));
    expect(asked?.query.q).toContain('سرک چهارم');
    expect(asked?.query.q).toContain('کابل');
  });

  it('says there is no exact location when the map knows nothing of it', async () => {
    search([]);
    const tree = await open();
    expect(mapParts(tree.root, 'Map')).toHaveLength(0);
    expect(allText(tree.root)).toContain(prs.map.noExact);
  });

  it('says so too when the map cannot be reached', async () => {
    search('down');
    const tree = await open();
    expect(allText(tree.root)).toContain(prs.map.noExact);
  });

  it('never asks the map for a listing that has its own pin', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${ID}`]: { body: listing({ lat: 34.5, lng: 69.1 }) },
    });
    const tree = await open();
    expect(mapParts(tree.root, 'Map')).toHaveLength(1);
    expect(allText(tree.root)).not.toContain(prs.property.approxLocation);
    expect(
      callsTo(fetchMock).filter(c => c.path.endsWith('/search')),
    ).toHaveLength(0);
  });
});

describe('the list card has fewer lines and a round Share icon', () => {
  const card = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PropertyCard property={listing() as never} onPress={() => undefined} />
      </QueryClientProvider>,
    );

  /** The styles of every plain view under the card that draw a hairline (the grey of `colors.border`) on their top edge. */
  const hairlinesAbove = (root: ReactTestRenderer.ReactTestInstance) =>
    root
      .findAll(n => typeof n.type === 'string')
      .filter(n => {
        const style = StyleSheet.flatten(n.props.style) ?? {};
        return (
          Boolean(style.borderTopWidth) && style.borderTopColor === '#E5E7EB'
        );
      });

  it('draws no line above the facts and none above the description', async () => {
    const tree = await card();
    expect(hairlinesAbove(tree.root)).toHaveLength(0);
  });

  it('gives Share a round, edged icon button of its own beside the bookmark, not a pill at the foot', async () => {
    const tree = await card();
    const share = tree.root.find(
      n =>
        typeof n.type === 'string' &&
        n.props.accessibilityLabel === `${prs.property.share}: آپارتمان`,
    );
    const style = StyleSheet.flatten(share.props.style);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.width).toBe(style.height);
    expect(style.borderRadius).toBe(style.width / 2);
  });
});

describe('the new texts', () => {
  const keys = (o: object, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null
        ? keys(v, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
  it.each(['dealPrice', 'priceTerms', 'mortgage', 'frame'] as const)(
    '%s has the same keys in Dari and Pashto, and the same placeholders',
    ns => {
      expect(keys(ps[ns]).sort()).toEqual(keys(prs[ns]).sort());
      const holes = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
      for (const key of keys(prs[ns])) {
        const read = (root: Record<string, unknown>) =>
          key
            .split('.')
            .reduce<unknown>(
              (o, k) => (o as Record<string, unknown>)[k],
              root,
            ) as string;
        expect(holes(read(ps[ns] as never))).toEqual(
          holes(read(prs[ns] as never)),
        );
      }
    },
  );

  it('calls the featured frame «کادر ویژه برای آگهی» everywhere it is sold', () => {
    expect(prs.frame.title).toBe('کادر ویژه برای آگهی');
    expect(prs.frame.gift).toBe('کادر ویژه برای آگهی هدیه');
    expect(prs.frame.giftCount).toContain('کادر ویژه برای آگهی هدیه');
  });
});
