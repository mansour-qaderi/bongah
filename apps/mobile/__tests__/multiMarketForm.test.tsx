import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { setAuthToken } from '../src/api/client';
import { KV_KEYS, kv } from '../src/storage/kv';
import { resetMarketForTests, setMarket } from '../src/market/marketStore';
import {
  allText,
  callsTo,
  chooseType,
  inputLabelled,
  jsonResponse,
  mapParts,
  render as renderTree,
  tapMap,
  typeOptions,
} from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: { status: string; user: unknown } = { status: 'signedIn', user: null };

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () => require('../test-utils/navMock').navigationModule());
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screen picks them up.
import AddPropertyScreen, { LOOKUP_DELAY_MS } from '../src/screens/property/AddPropertyScreen';

const nativeMap = () =>
  jest.requireMock('../src/map/native') as {
    __flyTo: jest.Mock;
    __location: { grant: boolean; position: unknown; requests: number };
  };

const user = { id: 'u1', role: 'USER', phone_number: '+93701234567', full_name: null, avatar: null };
const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const settle = async (rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
const wait = (ms: number) =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), ms));
  });

const editForm = (propertyId: string) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AddPropertyScreen
      {...({
        navigation: {
          navigate: jest.fn(),
          replace: jest.fn(),
          goBack: jest.fn(),
          setOptions: jest.fn(),
          addListener: jest.fn(() => () => undefined),
        },
        route: { params: { propertyId } },
      } as unknown as React.ComponentProps<typeof AddPropertyScreen>)}
    />
  </QueryClientProvider>
);

const form = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AddPropertyScreen
      {...({
        navigation: {
          navigate: jest.fn(),
          replace: jest.fn(),
          goBack: jest.fn(),
          setOptions: jest.fn(),
          addListener: jest.fn(() => () => undefined),
        },
        route: { params: undefined },
      } as unknown as React.ComponentProps<typeof AddPropertyScreen>)}
    />
  </QueryClientProvider>
);

type Root = ReactTestRenderer.ReactTestInstance;
const pressable = (root: Root, id: string) =>
  root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = (root: Root, id: string) =>
  act(async () => {
    const node = pressable(root, id);
    if (!node) throw new Error(`nothing pressable with testID ${id}`);
    node.props.onPress();
  });
// The chip component itself carries `selected`; the pressable it draws carries the same in its accessibility state.
const selected = (root: Root, id: string) => {
  const node = pressable(root, id);
  return node?.props.selected === true || node?.props.accessibilityState?.selected === true;
};
/** One tap on + for the bedrooms and the bathrooms: a flat or a villa will not go without them. */
const rooms = async (root: Root) => {
  for (const label of [prs.add.bedrooms, prs.add.bathrooms]) {
    await act(async () => {
      root
        .find(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === `${label}: ${prs.common.increase}`)
        .props.onPress();
    });
  }
};
const present = (root: Root, id: string) => pressable(root, id) !== undefined;
const typeInto = (root: Root, label: string, text: string) =>
  act(async () => {
    inputLabelled(root, label).props.onChangeText(text);
  });

const answer = (api: Record<string, (url: URL, init: RequestInit) => { status?: number; body?: unknown }>) =>
  fetchMock.mockImplementation(async (raw: string, init: RequestInit = {}) => {
    const url = new URL(raw);
    const handler = api[`${init.method ?? 'GET'} ${url.pathname}`];
    if (!handler) return jsonResponse(404, { message: `no route for ${url.pathname}` });
    const reply = handler(url, init);
    return jsonResponse(reply.status ?? 200, reply.body);
  });

const TEHRAN: [number, number] = [51.389, 35.6892];
const reverseTehran = {
  'GET /geo/reverse': () => ({
    body: { provider: 'google', title: 'x', address: 'x', lat: 35.6892, lng: 51.389, province: 'تهران', district: 'ونک', neighborhood: '', street: '' },
  }),
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user };
  setAuthToken('token');
  await kv.remove(KV_KEYS.market);
  resetMarketForTests('AF');
  await setMarket('AF');
  nativeMap().__location.grant = false;
});
afterEach(async () => {
  setAuthToken(null);
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('the listing form in each country', () => {
  it("starts in the market the person works in, with Afghanistan's deals, money and kinds", async () => {
    answer({});
    const tree = await render(form());
    await settle();
    // The form has no country buttons: it works in the country the phone found (or the person chose in Settings).
    expect(present(tree.root, 'form-market-AF')).toBe(false);
    expect(present(tree.root, 'form-market-IR')).toBe(false);
    // A daily rental is offered in Afghanistan too.
    for (const deal of ['SALE', 'RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']) expect(present(tree.root, `deal-${deal}`)).toBe(true);
    expect(allText(tree.root)).toContain(prs.dealType.MORTGAGE_GROWI);
    expect(selected(tree.root, 'currency-AFGHANI')).toBe(true);
    expect(present(tree.root, 'currency-USD')).toBe(true);
    expect(present(tree.root, 'currency-TOMAN')).toBe(false);
    const types = (await typeOptions(tree.root)).map(o => o.value);
    expect(types).toContain('GARAGE');
    expect(types).toContain('WAREHOUSE');
    for (const iranOnly of ['DUPLEX', 'COMMERCIAL', 'LAND_OLD', 'VILLA_GARDEN']) expect(types).not.toContain(iranOnly);
    // Afghanistan: the deed paper (شرعی / عرفی), no tags.
    expect(present(tree.root, 'deed-SHARI')).toBe(true);
    expect(present(tree.root, 'deed-ORFI')).toBe(true);
    expect(present(tree.root, 'feature-ELEVATOR')).toBe(false);
    expect(present(tree.root, 'monthly-rent-input')).toBe(false);
  });

  it("opens in Iran for a person who works there, with Iran's words, toman and its kinds of property", async () => {
    await setMarket('IR');
    answer({});
    const tree = await render(form());
    await settle();
    expect(present(tree.root, 'form-market-IR')).toBe(false);
    for (const deal of ['SALE', 'MORTGAGE_RENT', 'MORTGAGE_GROWI', 'DAILY_RENT']) expect(present(tree.root, `deal-${deal}`)).toBe(true);
    // A plain rent is Afghanistan's; in Iran a rental is a mortgage-and-rent.
    expect(present(tree.root, 'deal-RENT')).toBe(false);
    const text = allText(tree.root);
    for (const word of [prs.dealTypeIR.SALE, prs.dealTypeIR.MORTGAGE_RENT, prs.dealTypeIR.MORTGAGE_GROWI, prs.dealTypeIR.DAILY_RENT]) {
      expect(text).toContain(word);
    }
    // The Afghan word for a mortgage is not used for Iran.
    expect(text).not.toContain(prs.dealType.MORTGAGE_GROWI);
    expect(selected(tree.root, 'currency-TOMAN')).toBe(true);
    // Iran prices in toman only: no rial, no dollar.
    expect(present(tree.root, 'currency-RIAL')).toBe(false);
    expect(present(tree.root, 'currency-USD')).toBe(false);
    expect(present(tree.root, 'currency-AFGHANI')).toBe(false);
    const types = (await typeOptions(tree.root)).map(o => o.value);
    // Exactly the six kinds of Iran's market; a duplex is a tag now.
    expect(types).toEqual(['APARTMENT', 'HOUSE_HAWILI', 'VILLA_GARDEN', 'LAND', 'LAND_OLD', 'COMMERCIAL']);
    // …named the Iranian way.
    const labels = (await typeOptions(tree.root)).map(o => o.label);
    expect(labels).toEqual(['آپارتمان', 'خانه / ویلایی', 'باغ و ویلا', 'زمین', 'خانه کلنگی', 'تجاری و اداری']);
    // The tags are Iran's, the deed is Afghanistan's.
    for (const feature of ['DUPLEX', 'PENTHOUSE', 'SINGLE_DEED', 'MASTER_ROOM', 'ELEVATOR', 'PARKING', 'STORAGE']) {
      expect(present(tree.root, `feature-${feature}`)).toBe(true);
    }
    expect(present(tree.root, 'deed-SHARI')).toBe(false);
    // Iran has no «select province», and the address is asked in Iran's natural style.
    expect(allText(tree.root)).not.toContain(prs.add.province);
    expect(inputLabelled(tree.root, prs.add.place).props.placeholder).toBe(prs.add.placePlaceholderIR);
  });

  it('follows the country when it changes: the money, deals and kinds follow, and what still fits is kept', async () => {
    answer({});
    const tree = await render(form());
    await settle();
    await press(tree.root, 'currency-USD');
    await press(tree.root, 'deal-MORTGAGE_GROWI');
    await act(async () => {
      await setMarket('IR');
    });
    await settle();
    // A mortgage exists in both countries and stays; a daily rental now exists. Iran prices in toman only, so the dollar
    // becomes the toman and no dollar or rial is offered.
    expect(selected(tree.root, 'currency-TOMAN')).toBe(true);
    expect(present(tree.root, 'currency-USD')).toBe(false);
    expect(selected(tree.root, 'deal-MORTGAGE_GROWI')).toBe(true);
    expect(present(tree.root, 'deal-DAILY_RENT')).toBe(true);
    // The map goes to Iran.
    expect(nativeMap().__flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [53.7, 32.4] }));

    // Back: Iran's daily rental and toman go, Afghanistan's afghani returns as the default.
    await press(tree.root, 'currency-TOMAN');
    await press(tree.root, 'deal-DAILY_RENT');
    await act(async () => {
      await setMarket('AF');
    });
    await settle();
    // Afghanistan has a daily rental too, so it stays; the toman goes and the afghani returns.
    expect(selected(tree.root, 'deal-DAILY_RENT')).toBe(true);
    expect(selected(tree.root, 'currency-AFGHANI')).toBe(true);
    expect(present(tree.root, 'currency-TOMAN')).toBe(false);
  });

  it('narrows the kinds of property to a villa or a garden for a daily rental', async () => {
    await setMarket('IR');
    answer({});
    const tree = await render(form());
    await settle();
    await chooseType(tree.root, 'APARTMENT');
    await press(tree.root, 'deal-DAILY_RENT');
    // The flat gives way to a villa/garden, the only kind a daily rental is for in Iran.
    expect((await typeOptions(tree.root)).map(o => o.value)).toEqual(['VILLA_GARDEN']);
    expect(allText(tree.root)).toContain(prs.dealPriceIR.DAILY_RENT);
  });

  it('refuses a pin in the other country, naming the country that was chosen', async () => {
    await setMarket('IR');
    answer(reverseTehran);
    const tree = await render(form());
    await settle();
    await act(async () => tapMap(tree.root, 'location-picker-map', [69.17, 34.53])); // Kabul
    await settle();
    expect(allText(tree.root)).toContain(prs.map.outside.replace('{{market}}', 'ایران'));
    expect(mapParts(tree.root, 'ViewAnnotation').filter(n => n.props.id === 'chosen')).toHaveLength(0);
    // A pin in Tehran is accepted.
    await act(async () => tapMap(tree.root, 'location-picker-map', TEHRAN));
    expect(mapParts(tree.root, 'ViewAnnotation').filter(n => n.props.id === 'chosen')).toHaveLength(1);
  });

  it("sends an Iranian daily rental of a villa-garden with its market, toman and Tehran's province", async () => {
    answer({
      ...reverseTehran,
      'POST /properties': () => ({ status: 201, body: { id: '11111111-1111-4111-8111-111111111111' } }),
    });
    await setMarket('IR');
    const tree = await render(form());
    await settle();
    await press(tree.root, 'deal-DAILY_RENT');
    await chooseType(tree.root, 'VILLA_GARDEN');
    await act(async () => tapMap(tree.root, 'location-picker-map', TEHRAN));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    await typeInto(tree.root, prs.add.titleField, 'باغ ویلا با استخر در شمیرانات');
    await typeInto(tree.root, prs.add.descriptionLabel, 'باغ مصفا با درختان میوه');
    await typeInto(tree.root, prs.add.area, '1200');
    await rooms(tree.root);
    await typeInto(tree.root, prs.dealPriceIR.DAILY_RENT, '3500000');
    await act(async () => {
      tree.root
        .findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.submit)[0]
        .props.onPress();
    });
    await settle();
    const post = callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');
    expect(post).toBeDefined();
    expect(post!.body).toMatchObject({
      market: 'IR',
      type: 'VILLA_GARDEN',
      deal_type: 'DAILY_RENT',
      currency: 'TOMAN',
      price: 3_500_000,
      province: 'تهران',
    });
    expect(post!.body.lat).toBeCloseTo(35.6892, 4);
    expect(post!.body.lng).toBeCloseTo(51.389, 4);
  });

  it('sends the market with an Afghan listing too, so the server never has to guess', async () => {
    answer({
      'GET /geo/reverse': () => ({
        body: { provider: 'google', title: 'x', address: 'x', lat: 30.96, lng: 61.86, province: 'نیمروز', district: 'زرنج', neighborhood: '', street: '' },
      }),
      'POST /properties': () => ({ status: 201, body: { id: '11111111-1111-4111-8111-111111111111' } }),
    });
    const tree = await render(form());
    await settle();
    await act(async () => tapMap(tree.root, 'location-picker-map', [61.86, 30.96]));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    await chooseType(tree.root, 'LAND');
    await typeInto(tree.root, prs.add.titleField, 'زمین در زرنج');
    await typeInto(tree.root, prs.add.descriptionLabel, 'زمین هموار');
    await typeInto(tree.root, prs.add.area, '2000');
    await typeInto(tree.root, prs.dealPrice.SALE, '2500000');
    await act(async () => {
      tree.root
        .findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.submit)[0]
        .props.onPress();
    });
    await settle();
    const post = callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');
    expect(post!.body).toMatchObject({ market: 'AF', currency: 'AFGHANI', deal_type: 'SALE', province: 'نیمروز' });
  });
});

const submitButton = (root: Root) =>
  root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.submit)[0];
const posted = () => callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');

describe('Iran: a mortgage-and-rent with a deposit and a monthly rent, and the tags', () => {
  const fillTehran = async (root: Root, deposit: string) => {
    await act(async () => tapMap(root, 'location-picker-map', TEHRAN));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    await typeInto(root, prs.add.titleField, 'آپارتمان دو خوابه در ونک');
    await typeInto(root, prs.add.descriptionLabel, 'آپارتمان نوساز');
    await typeInto(root, prs.add.area, '85');
    await rooms(root);
    await typeInto(root, prs.dealPriceIR.MORTGAGE_RENT, deposit);
  };

  it('asks for the rent beside the deposit, only for that deal', async () => {
    await setMarket('IR');
    answer({});
    const tree = await render(form());
    await settle();
    expect(present(tree.root, 'monthly-rent-input')).toBe(false);
    await press(tree.root, 'deal-MORTGAGE_RENT');
    expect(allText(tree.root)).toContain(prs.dealPriceIR.MORTGAGE_RENT);
    expect(inputLabelled(tree.root, prs.add.monthlyRent)).toBeDefined();
    await press(tree.root, 'deal-SALE');
    expect(() => inputLabelled(tree.root, prs.add.monthlyRent)).toThrow();
  });

  it('does not send a mortgage-and-rent without its monthly rent, and sends deposit, rent and tags together', async () => {
    await setMarket('IR');
    answer({
      ...reverseTehran,
      'POST /properties': () => ({ status: 201, body: { id: '11111111-1111-4111-8111-111111111111' } }),
    });
    const tree = await render(form());
    await settle();
    await press(tree.root, 'deal-MORTGAGE_RENT');
    await fillTehran(tree.root, '200000000');
    await press(tree.root, 'feature-ELEVATOR');
    await press(tree.root, 'feature-PARKING');
    await act(async () => submitButton(tree.root).props.onPress());
    await settle();
    // No rent yet: nothing is sent, and the rent says so.
    expect(posted()).toBeUndefined();
    await typeInto(tree.root, prs.add.monthlyRent, '8000000');
    await act(async () => submitButton(tree.root).props.onPress());
    await settle();
    expect(posted()).toBeDefined();
    expect(posted()!.body).toMatchObject({
      market: 'IR',
      type: 'APARTMENT',
      deal_type: 'MORTGAGE_RENT',
      currency: 'TOMAN',
      price: 200_000_000,
      monthly_rent: 8_000_000,
      features: ['ELEVATOR', 'PARKING'],
    });
    expect(posted()!.body).not.toHaveProperty('deed_type');
  });

  it('sends no monthly rent for a sale, even after one was typed for the other deal', async () => {
    await setMarket('IR');
    answer({
      ...reverseTehran,
      'POST /properties': () => ({ status: 201, body: { id: '11111111-1111-4111-8111-111111111111' } }),
    });
    const tree = await render(form());
    await settle();
    await press(tree.root, 'deal-MORTGAGE_RENT');
    await typeInto(tree.root, prs.add.monthlyRent, '9000000');
    await press(tree.root, 'deal-SALE');
    await act(async () => tapMap(tree.root, 'location-picker-map', TEHRAN));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    await typeInto(tree.root, prs.add.titleField, 'آپارتمان برای فروش در ونک');
    await typeInto(tree.root, prs.add.descriptionLabel, 'آپارتمان نوساز');
    await typeInto(tree.root, prs.add.area, '85');
    await rooms(tree.root);
    await typeInto(tree.root, prs.dealPriceIR.SALE, '9000000000');
    await act(async () => submitButton(tree.root).props.onPress());
    await settle();
    expect(posted()).toBeDefined();
    expect(posted()!.body).toMatchObject({ deal_type: 'SALE', price: 9_000_000_000 });
    expect(posted()!.body).not.toHaveProperty('monthly_rent');
  });

  it("takes Iran's tags off when the country changes to Afghanistan, and Afghanistan's deed is sent from there", async () => {
    await setMarket('IR');
    answer({});
    const tree = await render(form());
    await settle();
    await press(tree.root, 'feature-ELEVATOR');
    expect(selected(tree.root, 'feature-ELEVATOR')).toBe(true);
    await act(async () => {
      await setMarket('AF');
    });
    await settle();
    expect(present(tree.root, 'feature-ELEVATOR')).toBe(false);
    expect(present(tree.root, 'deed-ORFI')).toBe(true);
    await press(tree.root, 'deed-ORFI');
    expect(selected(tree.root, 'deed-ORFI')).toBe(true);
    await act(async () => {
      await setMarket('IR');
    });
    await settle();
    expect(present(tree.root, 'deed-ORFI')).toBe(false);
    expect(selected(tree.root, 'feature-ELEVATOR')).toBe(false);
  });
});

describe('Afghanistan: the deed paper and a godam', () => {
  it('sends the deed and the godam kind, and no tags', async () => {
    answer({
      'GET /geo/reverse': () => ({
        body: { provider: 'google', title: 'x', address: 'x', lat: 30.96, lng: 61.86, province: 'نیمروز', district: 'زرنج', neighborhood: '', street: '' },
      }),
      'POST /properties': () => ({ status: 201, body: { id: '11111111-1111-4111-8111-111111111111' } }),
    });
    const tree = await render(form());
    await settle();
    await act(async () => tapMap(tree.root, 'location-picker-map', [61.86, 30.96]));
    await wait(LOOKUP_DELAY_MS + 50);
    await settle();
    await chooseType(tree.root, 'WAREHOUSE');
    await press(tree.root, 'deed-SHARI');
    await typeInto(tree.root, prs.add.titleField, 'گدام بزرگ در زرنج');
    await typeInto(tree.root, prs.add.descriptionLabel, 'گدام با دروازه بزرگ');
    await typeInto(tree.root, prs.add.area, '600');
    await typeInto(tree.root, prs.dealPrice.SALE, '5000000');
    await act(async () => submitButton(tree.root).props.onPress());
    await settle();
    expect(posted()).toBeDefined();
    expect(posted()!.body).toMatchObject({ market: 'AF', type: 'WAREHOUSE', deed_type: 'SHARI', deal_type: 'SALE' });
    expect(posted()!.body).not.toHaveProperty('features');
    expect(posted()!.body).not.toHaveProperty('monthly_rent');
    // A godam has no rooms to count.
    expect(posted()!.body).not.toHaveProperty('bedrooms');
  });
});

describe('editing a listing of either country', () => {
  const ID = '33333333-3333-4333-8333-333333333333';
  const stored = (over: Record<string, unknown>) => ({
    id: ID,
    user_id: 'u1',
    agency_id: null,
    agency_name: null,
    title: 'آپارتمان در ونک',
    description: 'نوساز',
    type: 'APARTMENT',
    market: 'IR',
    deal_type: 'MORTGAGE_RENT',
    price: 200_000_000,
    monthly_rent: 8_000_000,
    currency: 'TOMAN',
    features: ['ELEVATOR'],
    deed_type: null,
    area_sqm: 85,
    bedrooms: 2,
    bathrooms: 1,
    province: 'تهران',
    district: 'ونک',
    neighborhood: null,
    address: 'ونک، خیابان ملاصدرا',
    lat: 35.6892,
    lng: 51.389,
    images: [],
    status: 'ACTIVE',
    is_featured: false,
    featured_until: null,
    laddered_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  });
  const patched = () => callsTo(fetchMock).find(c => c.method === 'PATCH');

  it("fills an Iranian mortgage-and-rent back in with its rent and tags, and saves them", async () => {
    answer({
      [`GET /properties/${ID}`]: () => ({ body: stored({}) }),
      [`PATCH /properties/${ID}`]: () => ({ body: stored({}) }),
      'GET /hesabpay/pricing': () => ({ body: { currency: 'AFGHANI', featured_ad: 100 } }),
    });
    const tree = await render(editForm(ID));
    await settle();
    // An existing listing keeps its country: the form is Iran's (no country switch) and the deal is filled in.
    expect(present(tree.root, 'form-market-IR')).toBe(false);
    expect(selected(tree.root, 'deal-MORTGAGE_RENT')).toBe(true);
    expect(inputLabelled(tree.root, prs.add.monthlyRent).props.value).toMatch(/8[,٬]?000[,٬]?000|۸/);
    expect(selected(tree.root, 'feature-ELEVATOR')).toBe(true);
    expect(selected(tree.root, 'feature-PARKING')).toBe(false);
    await press(tree.root, 'feature-PARKING');
    await typeInto(tree.root, prs.add.monthlyRent, '9000000');
    await act(async () => {
      tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.save)[0].props.onPress();
    });
    await settle();
    expect(patched()?.body).toMatchObject({
      deal_type: 'MORTGAGE_RENT',
      price: 200_000_000,
      monthly_rent: 9_000_000,
      features: ['ELEVATOR', 'PARKING'],
    });
    // The market is not sent on an edit: a listing keeps the country it has.
    expect(patched()?.body).not.toHaveProperty('market');
  });

  it("keeps an old listing's kind in the picker, and clears an Afghan deed with null", async () => {
    await setMarket('AF');
    answer({
      [`GET /properties/${ID}`]: () =>
        ({
          body: stored({
            market: 'AF',
            type: 'HOUSE_HAWILI',
            deal_type: 'SALE',
            monthly_rent: null,
            currency: 'AFGHANI',
            price: 2_500_000,
            features: [],
            deed_type: 'ORFI',
            province: 'کابل',
            lat: 34.5281,
            lng: 69.1723,
          }),
        }),
      [`PATCH /properties/${ID}`]: () => ({ body: stored({}) }),
      'GET /hesabpay/pricing': () => ({ body: { currency: 'AFGHANI', featured_ad: 100 } }),
    });
    const tree = await render(editForm(ID));
    await settle();
    expect(selected(tree.root, 'deed-ORFI')).toBe(true);
    expect(present(tree.root, 'monthly-rent-input')).toBe(false);
    await press(tree.root, 'deed-NONE');
    await act(async () => {
      tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && allText(n) === prs.add.save)[0].props.onPress();
    });
    await settle();
    expect(patched()?.body).toMatchObject({ deal_type: 'SALE', deed_type: null });
    expect(patched()?.body).not.toHaveProperty('features');
    expect(patched()?.body).not.toHaveProperty('monthly_rent');
  });
});

