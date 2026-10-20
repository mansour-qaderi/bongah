import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  callsTo,
  inputLabelled,
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
import AddPropertyScreen from '../src/screens/property/AddPropertyScreen';
import {
  ToastHost,
  showToast,
  hideToast,
  TOAST_MS,
} from '../src/components/Toast';
import {
  formFieldFor,
  serverFieldErrors,
  toastForErrors,
} from '../src/screens/property/formErrors';
import { ApiError } from '../src/api/client';
import i18next from 'i18next';
import ps from '../src/i18n/locales/ps.json';
import { PROPERTY_TYPES } from '@bongah/shared-types';
import { createPropertySchema } from '@bongah/validation';

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
const type = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  text: string,
) =>
  act(async () => {
    inputLabelled(root, label).props.onChangeText(text);
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
  await type(root, prs.add.descriptionLabel, 'خانه نو با دو اتاق خواب');
  await type(root, prs.dealPrice.SALE, '1200000');
  await type(root, prs.add.area, '120');
  await addRooms(root);
  await type(root, prs.add.address, WRITTEN_ADDRESS);
  await press(root, prs.home.selectProvince); // opens the province list
  await press(root, 'کابل');
}
/** The same, up to and including the basics and the rooms, but no address at all: the pin is meant to supply it. */
async function fillBasics(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'آپارتمان سه‌خوابه');
  await type(root, prs.add.descriptionLabel, 'خانه نو با دو اتاق خواب');
  await type(root, prs.dealPrice.SALE, '1200000');
  await type(root, prs.add.area, '120');
  await addRooms(root);
}
/** The same as `fillForm` for a type with no rooms to count (land, a garden, a garage). */
async function fillFormWithoutRooms(root: ReactTestRenderer.ReactTestInstance) {
  await type(root, prs.add.titleField, 'گاراج بزرگ');
  await type(root, prs.add.descriptionLabel, 'خانه نو با دو اتاق خواب');
  await type(root, prs.dealPrice.SALE, '1200000');
  await type(root, prs.add.area, '120');
  await type(root, prs.add.address, WRITTEN_ADDRESS);
  await press(root, prs.home.selectProvince);
  await press(root, 'کابل');
}
const posted = () =>
  callsTo(fetchMock).find(c => c.method === 'POST' && c.path === '/properties');

const toastOf = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAll(
    n => n.props.testID === 'toast' && typeof n.type === 'string',
  )[0];

const GENERIC = [prs.errors.validation, prs.add.fixErrors];
const t = i18next.t.bind(i18next);

describe('field errors from the server, in words', () => {
  const rejected = (errors: { field: string; message: string }[]) =>
    new ApiError('http', 400, { message: 'Validation failed', errors });

  it('files each error under the form field it belongs to', () => {
    const found = serverFieldErrors(
      rejected([
        { field: 'price', message: 'Too small: expected number to be >0' },
        { field: 'lat', message: 'Latitude is outside Afghanistan' },
        { field: 'district', message: 'Too short' },
        { field: 'images.1', message: 'Invalid URL' },
      ]),
      t as never,
    );
    expect(found).toEqual({
      price: prs.add.error.price,
      location: prs.map.outside,
      address: prs.add.error.address,
      images: prs.add.error.images,
    });
  });

  it("says a type the server does not know is the server's to learn, not the person's mistake", () => {
    const found = serverFieldErrors(
      rejected([
        {
          field: 'type',
          message: 'Invalid option: expected one of "HOUSE"|"APARTMENT"',
        },
      ]),
      t as never,
    );
    expect(found).toEqual({ type: prs.add.error.typeNotSupported });
  });

  it('finds the field in the message when the server refuses a key it has never heard of', () => {
    const found = serverFieldErrors(
      rejected([{ field: '', message: 'Unrecognized key: "unit"' }]),
      t as never,
    );
    expect(found).toEqual({ unit: prs.add.error.notSupported });
  });

  it('says "required" for a missing value', () => {
    const found = serverFieldErrors(
      rejected([
        {
          field: 'title',
          message: 'Invalid input: expected string, received undefined',
        },
      ]),
      t as never,
    );
    expect(found).toEqual({ title: prs.add.required });
  });

  it('has nothing to point at without field detail, for other statuses, or for names the form does not have', () => {
    expect(
      serverFieldErrors(new ApiError('http', 400, {}), t as never),
    ).toBeNull();
    expect(
      serverFieldErrors(
        new ApiError('http', 500, {
          errors: [{ field: 'price', message: 'x' }],
        }),
        t as never,
      ),
    ).toBeNull();
    expect(
      serverFieldErrors(
        rejected([{ field: 'status', message: 'x' }]),
        t as never,
      ),
    ).toBeNull();
    expect(serverFieldErrors(new Error('x'), t as never)).toBeNull();
  });

  it('knows every field of the form, and the aliases the API uses', () => {
    expect(formFieldFor('lat')).toBe('location');
    expect(formFieldFor('lng')).toBe('location');
    expect(formFieldFor('district')).toBe('address');
    expect(formFieldFor('neighborhood')).toBe('address');
    expect(formFieldFor('images.0')).toBe('images');
    expect(formFieldFor('deal_type')).toBe('deal_type');
    expect(formFieldFor('area_sqm')).toBe('area_sqm');
    expect(formFieldFor('nope')).toBeNull();
  });

  it('names the first failing field in the toast, and counts the rest', () => {
    const one = toastForErrors({ price: prs.add.error.price }, t as never);
    expect(one).toBe(`${prs.add.price}: ${prs.add.error.price}`);
    const many = toastForErrors(
      { price: prs.add.error.price, title: prs.add.required, type: 'x' },
      t as never,
    );
    // the form's own order: the title comes before the price; two more follow
    expect(many.startsWith(`${prs.add.titleField}: ${prs.add.required}`)).toBe(
      true,
    );
    expect(many).toContain('۲');
    expect(many).not.toContain('(');
  });

  it('has every message in both languages', () => {
    const keys = Object.keys(prs.add.error).sort();
    expect(Object.keys(ps.add.error).sort()).toEqual(keys);
    for (const key of keys) {
      expect((prs.add.error as Record<string, string>)[key].trim()).not.toBe(
        '',
      );
      expect((ps.add.error as Record<string, string>)[key].trim()).not.toBe('');
    }
  });
});

describe('the toast', () => {
  const Host = () => (
    <>
      <ToastHost />
    </>
  );

  it('shows a message, replaces it with the next, and goes away by itself', async () => {
    jest.useFakeTimers();
    try {
      const tree = await render(<Host />);
      expect(toastOf(tree.root)).toBeUndefined();
      await act(async () => showToast('اولی'));
      expect(allText(toastOf(tree.root))).toBe('اولی');
      await act(async () => showToast('دومی'));
      expect(allText(toastOf(tree.root))).toBe('دومی');
      await act(async () => {
        jest.advanceTimersByTime(TOAST_MS + 50);
      });
      expect(toastOf(tree.root)).toBeUndefined();
      tree.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('is an alert for a screen reader, and a tap dismisses it', async () => {
    const tree = await render(<Host />);
    await act(async () => showToast('خطا'));
    const toast = toastOf(tree.root);
    expect(toast.props.accessibilityRole).toBe('alert');
    expect(toast.props.accessibilityLiveRegion).toBe('assertive');
    const tap = tree.root.find(
      n => n.props.testID === 'toast' && typeof n.props.onPress === 'function',
    );
    await act(async () => tap.props.onPress());
    expect(toastOf(tree.root)).toBeUndefined();
    tree.unmount();
  });

  it('ignores an empty message', async () => {
    const tree = await render(<Host />);
    await act(async () => showToast('   '));
    expect(toastOf(tree.root)).toBeUndefined();
    tree.unmount();
  });

  it('is drawn once when the app and a sheet both have a host: by the one mounted last', async () => {
    const tree = await render(
      <>
        <ToastHost />
        <ToastHost />
      </>,
    );
    await act(async () => showToast('یک بار'));
    expect(
      tree.root.findAll(
        n => n.props?.testID === 'toast' && typeof n.type === 'string',
      ),
    ).toHaveLength(1);
    tree.unmount();
    hideToast();
  });

  it('is drawn inside a bottom sheet, which is a modal and would otherwise cover it', async () => {
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await act(async () => showToast('از داخل شیت'));
    expect(allText(toastOf(tree.root))).toBe('از داخل شیت');
    mounted.push(tree);
  });
});

describe('AddPropertyScreen: what is wrong is said where it is wrong', () => {
  const routes = { 'POST /properties': { status: 201, body: listing() } };
  const open = async () => {
    answerGeocoder(KABUL_SPOT, routes);
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    return tree;
  };
  const noGenericBanner = (root: ReactTestRenderer.ReactTestInstance) => {
    const text = allText(root);
    for (const sentence of GENERIC) expect(text).not.toContain(sentence);
  };

  it('puts a specific message under each empty field, and a toast naming the first, with no generic banner', async () => {
    const tree = await open();
    await press(tree.root, prs.add.submit);
    await settle();
    const text = allText(tree.root);
    noGenericBanner(tree.root);
    // title, price, area: each one says it is needed, under itself
    expect(text.split(prs.add.required).length - 1).toBeGreaterThanOrEqual(3);
    expect(allText(toastOf(tree.root))).toContain(prs.add.titleField);
    expect(posted()).toBeUndefined();
  });

  it('says what a good price looks like, not just that it is wrong', async () => {
    const tree = await open();
    await fillForm(tree.root);
    await type(tree.root, prs.dealPrice.SALE, '0');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain(prs.add.error.price);
    expect(allText(toastOf(tree.root))).toBe(
      `${prs.add.price}: ${prs.add.error.price}`,
    );
    expect(posted()).toBeUndefined();
  });

  it('shows a province that was not chosen under the province box', async () => {
    const tree = await open();
    await fillBasics(tree.root);
    await type(tree.root, prs.add.address, WRITTEN_ADDRESS);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain(prs.add.required);
    expect(allText(toastOf(tree.root))).toContain(prs.add.province);
  });

  it("clears a field's message as soon as that field is edited", async () => {
    const tree = await open();
    await press(tree.root, prs.add.submit);
    await settle();
    const before = allText(tree.root).split(prs.add.required).length - 1;
    await type(tree.root, prs.add.titleField, 'آپارتمان سه‌خوابه');
    expect(allText(tree.root).split(prs.add.required).length - 1).toBe(
      before - 1,
    );
  });

  it("puts a server's refusal of the property type under the type chips", async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': {
        status: 400,
        body: {
          message: 'Validation failed',
          errors: [
            {
              field: 'type',
              message: 'Invalid option: expected one of "HOUSE"',
            },
          ],
        },
      },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
    expect(allText(tree.root)).toContain(prs.add.error.typeNotSupported);
    expect(allText(toastOf(tree.root))).toBe(
      `${prs.add.type}: ${prs.add.error.typeNotSupported}`,
    );
    noGenericBanner(tree.root);
  });

  it('puts a server\'s "unknown key" under that field', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': {
        status: 400,
        body: {
          message: 'Validation failed',
          errors: [{ field: '', message: 'Unrecognized key: "unit"' }],
        },
      },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await type(tree.root, `${prs.add.unit} (${prs.common.optional})`, 'واحد ۳');
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain(prs.add.error.notSupported);
    noGenericBanner(tree.root);
  });

  it.each([
    ['the network is down', undefined, prs.errors.network],
    [
      'the server fails',
      { status: 500, body: { message: 'boom' } },
      prs.errors.unknown,
    ],
  ] as const)(
    'tells it in a toast, not a banner, when %s',
    async (_name, reply, sentence) => {
      answerGeocoder(KABUL_SPOT, {});
      if (reply === undefined) {
        const api = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementation(
          async (url: string, init?: RequestInit) => {
            if (String(url).includes('nominatim')) return api(url, init);
            throw new TypeError('Network request failed');
          },
        );
      } else {
        answerGeocoder(KABUL_SPOT, { 'POST /properties': reply });
      }
      const tree = await render(screenElement(AddPropertyScreen, navigation()));
      await settle();
      await fillForm(tree.root);
      await press(tree.root, prs.add.submit);
      await settle();
      expect(allText(toastOf(tree.root))).toBe(sentence);
      noGenericBanner(tree.root);
      // nothing but the toast says it: no error banner in the form
      expect(
        tree.root.findAll(
          n =>
            n.props.accessibilityRole === 'alert' &&
            typeof n.type === 'string' &&
            n.props.testID !== 'toast',
        ),
      ).toHaveLength(0);
    },
  );

  it('keeps the one banner that has a button: a subscription is needed', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': {
        status: 402,
        body: { code: 'SUBSCRIPTION_REQUIRED' },
      },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain(prs.add.subscriptionRequired);
    expect(allText(tree.root)).toContain(prs.add.buySubscription);
  });

  it('does not send a blank unit, unless it clears one that was there', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()).toBeDefined();
    expect('unit' in (posted()!.body as object)).toBe(false);
  });
});

describe('the form and the API agree on what a property type is', () => {
  const chips = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAll(
      n =>
        typeof n.props.onPress === 'function' &&
        PROPERTY_TYPES.some(
          p =>
            n.props.accessibilityLabel === undefined &&
            allText(n) === (prs.propertyType as Record<string, string>)[p],
        ),
    );

  it('offers exactly the nine types, in the order of the shared list, and the shared schema accepts each', async () => {
    expect(PROPERTY_TYPES).toEqual([
      'HOUSE_HAWILI',
      'APARTMENT',
      'SHOP',
      'OFFICE',
      'LAND',
      'GARDEN',
      'VILLA',
      'GARAGE',
      'OTHER',
    ]);
    const base = {
      title: 'خانه نمونه',
      deal_type: 'SALE',
      price: 1000,
      currency: 'AFGHANI',
      area_sqm: 100,
      province: 'کابل',
      address: 'سرک چهارم',
      description: 'خانه نو',
    };
    for (const type of PROPERTY_TYPES) {
      expect(createPropertySchema.safeParse({ ...base, type }).success).toBe(
        true,
      );
    }
    for (const old of [
      'HOUSE',
      'OFFICE_SHOP',
      'GARDEN_VILLA',
      'GARAGE_OTHER',
    ]) {
      expect(
        createPropertySchema.safeParse({ ...base, type: old }).success,
      ).toBe(false);
    }
    answerGeocoder(KABUL_SPOT, {});
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    mounted.push(tree);
    await settle();
    const text = allText(tree.root);
    const order = PROPERTY_TYPES.map(p =>
      text.indexOf((prs.propertyType as Record<string, string>)[p]),
    );
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    void chips;
  });

  it('sends the type it shows: choosing «ویلا» posts VILLA, «دفتر» posts OFFICE', async () => {
    for (const [label, wire] of [
      [prs.propertyType.VILLA, 'VILLA'],
      [prs.propertyType.OFFICE, 'OFFICE'],
    ] as const) {
      fetchMock.mockReset();
      answerGeocoder(KABUL_SPOT, {
        'POST /properties': { status: 201, body: listing() },
      });
      const tree = await render(screenElement(AddPropertyScreen, navigation()));
      mounted.push(tree);
      await settle();
      await press(tree.root, label);
      await fillForm(tree.root);
      await press(tree.root, prs.add.submit);
      await settle();
      expect(posted()?.body.type).toBe(wire);
    }
  });
});

describe('the unit box only asks about buildings', () => {
  const UNIT_LABEL = `${prs.add.unit} (${prs.common.optional})`;
  const hasUnitBox = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAll(
      n =>
        typeof n.type !== 'string' && n.props.accessibilityLabel === UNIT_LABEL,
    ).length > 0;
  const open = async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    return tree;
  };

  it.each([
    ['HOUSE_HAWILI', true],
    ['APARTMENT', true],
    ['OFFICE', true],
    ['SHOP', false],
    ['LAND', false],
    ['GARDEN', false],
    ['VILLA', false],
    ['GARAGE', false],
    ['OTHER', false],
  ] as const)('%s: unit box shown = %s', async (kind, shown) => {
    const tree = await open();
    await press(tree.root, (prs.propertyType as Record<string, string>)[kind]);
    expect(hasUnitBox(tree.root)).toBe(shown);
    expect(allText(tree.root).includes(prs.add.unitHelp)).toBe(shown);
  });

  it('is there from the start (a house is the first type) and goes when a garage is chosen', async () => {
    const tree = await open();
    expect(hasUnitBox(tree.root)).toBe(true);
    await press(tree.root, prs.propertyType.GARAGE);
    expect(hasUnitBox(tree.root)).toBe(false);
  });

  it('keeps what was typed while another type is looked at, but only a building sends it', async () => {
    const tree = await open();
    await press(tree.root, prs.propertyType.APARTMENT);
    await type(tree.root, UNIT_LABEL, 'واحد سوم');
    await press(tree.root, prs.propertyType.GARAGE);
    await press(tree.root, prs.propertyType.APARTMENT);
    expect(inputLabelled(tree.root, UNIT_LABEL).props.value).toBe('واحد سوم');

    // back to a garage and send: no unit in the post
    await press(tree.root, prs.propertyType.GARAGE);
    await fillFormWithoutRooms(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body.type).toBe('GARAGE');
    expect('unit' in (posted()!.body as object)).toBe(false);
  });

  it('sends the unit for an apartment', async () => {
    const tree = await open();
    await press(tree.root, prs.propertyType.APARTMENT);
    await type(tree.root, UNIT_LABEL, 'واحد سوم');
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body.unit).toBe('واحد سوم');
  });

  it('a listing that had a unit loses it when it is changed to a type without units', async () => {
    const existing = listing({ type: 'APARTMENT', unit: 'واحد ۳' });
    answerGeocoder(KABUL_SPOT, {
      [`GET /properties/${existing.id}`]: { status: 200, body: existing },
      [`PATCH /properties/${existing.id}`]: { status: 200, body: existing },
    });
    const tree = await render(
      screenElement(AddPropertyScreen, navigation(), {
        params: { propertyId: existing.id },
      }),
    );
    await settle();
    expect(inputLabelled(tree.root, UNIT_LABEL).props.value).toBe('واحد ۳');
    await press(tree.root, prs.propertyType.GARAGE);
    await press(tree.root, prs.add.save);
    await settle();
    const patch = callsTo(fetchMock).find(c => c.method === 'PATCH');
    expect(patch?.body.type).toBe('GARAGE');
    expect(patch?.body.unit).toBeNull();
  });
});

describe('the price is written back under its box, with its currency', () => {
  const helperOf = (root: ReactTestRenderer.ReactTestInstance) => allText(root);
  const open = async () => {
    answerGeocoder(KABUL_SPOT, {});
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    return tree;
  };

  it('says nothing while the box is empty', async () => {
    const tree = await open();
    expect(helperOf(tree.root)).not.toContain(prs.currency.AFGHANI + ' ۰');
    expect(helperOf(tree.root)).not.toMatch(/[۰-۹,]+ (افغانی|دالر)/);
  });

  it('writes the amount in Persian digits, grouped, with the currency word, and follows the currency', async () => {
    const tree = await open();
    await type(tree.root, prs.dealPrice.SALE, '25000');
    expect(helperOf(tree.root)).toContain(`۲۵,۰۰۰ ${prs.currency.AFGHANI}`);
    await press(tree.root, prs.currency.USD);
    expect(helperOf(tree.root)).toContain(`۲۵,۰۰۰ ${prs.currency.USD}`);
    expect(helperOf(tree.root)).not.toContain(`۲۵,۰۰۰ ${prs.currency.AFGHANI}`);
  });

  it('grows with every digit', async () => {
    const tree = await open();
    await type(tree.root, prs.dealPrice.SALE, '3254123');
    expect(helperOf(tree.root)).toContain(`۳,۲۵۴,۱۲۳ ${prs.currency.AFGHANI}`);
  });

  it('looks like the area line: same kind of text under its box', async () => {
    const tree = await open();
    await type(tree.root, prs.dealPrice.SALE, '25000');
    await type(tree.root, prs.add.area, '200');
    const text = helperOf(tree.root);
    expect(text).toContain(`۲۰۰ ${prs.unit.sqm}`);
    expect(text).toContain(`۲۵,۰۰۰ ${prs.currency.AFGHANI}`);
  });
});

describe('the description goes out as typed and is read back as typed', () => {
  const written = 'خانه دو منزله\n\n  دارای حیاط بزرگ  \nنزدیک مکتب';
  it('is in the post exactly, line breaks kept', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await type(tree.root, prs.add.descriptionLabel, written);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(posted()?.body.description).toBe(
      'خانه دو منزله\n\nدارای حیاط بزرگ\nنزدیک مکتب',
    );
  });

  it('is required: a form with no description (or only blanks) is not posted, and says so under its box', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    // fillForm writes one; take it back out, then try again with only spaces.
    for (const text of ['', '   \n  ']) {
      await type(tree.root, prs.add.descriptionLabel, text);
      await press(tree.root, prs.add.submit);
      await settle();
      expect(posted()).toBeUndefined();
      expect(allText(toastOf(tree.root))).toContain(
        `${prs.add.descriptionLabel}: ${prs.add.required}`,
      );
    }
  });

  it('marks the box with a red asterisk and no longer calls it optional', async () => {
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    const label = tree.root
      .findAll(
        n => typeof n.type === 'string' && n.props.testID === 'label-row',
      )
      .find(row => allText(row).includes(prs.add.descriptionLabel));
    expect(label).toBeDefined();
    expect(allText(label!)).toMatch(
      new RegExp(`${prs.add.descriptionLabel}\\s+\\*`),
    );
    expect(allText(label!)).not.toContain(prs.common.optional);
  });

  it('comes back into the edit form, and an untouched save sends it unchanged', async () => {
    const text = 'خط اول\n\nخط سوم';
    const existing = listing({ description: text });
    answerGeocoder(KABUL_SPOT, {
      [`GET /properties/${existing.id}`]: { status: 200, body: existing },
      [`PATCH /properties/${existing.id}`]: { status: 200, body: existing },
    });
    const tree = await render(
      screenElement(AddPropertyScreen, navigation(), {
        params: { propertyId: existing.id },
      }),
    );
    await settle();
    expect(inputLabelled(tree.root, prs.add.descriptionLabel).props.value).toBe(
      text,
    );
    await press(tree.root, prs.add.save);
    await settle();
    const patch = callsTo(fetchMock).find(c => c.method === 'PATCH');
    expect(patch?.body.description).toBe(text);
  });
});

describe("when this month's free listing is used up", () => {
  const LIMIT = {
    status: 403,
    body: {
      code: 'FREE_LISTING_LIMIT_REACHED',
      resets_at: '2026-11-01T00:00:00Z',
    },
  };
  let now: jest.SpyInstance;
  beforeEach(() => {
    // The 19th of Aqrab-to-be: 27 Mehr 1405, so the renewal date is in the same Solar Hijri year.
    now = jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 19, 12));
  });
  afterEach(() => now.mockRestore());

  const submitToLimit = async (nav = navigation()) => {
    answerGeocoder(KABUL_SPOT, { 'POST /properties': LIMIT });
    const tree = await render(screenElement(AddPropertyScreen, nav));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    return tree;
  };

  it('says it in the words asked for, with the Solar Hijri date and no Gregorian one', async () => {
    const tree = await submitToLimit();
    const text = allText(tree.root);
    expect(text).toContain(
      'سقف آگهی‌های رایگان این ماه شما به پایان رسیده است (امکان ثبت بعدی: ۱۰ عقرب).',
    );
    expect(text).not.toMatch(
      /2026|۲۰۲۶|\d{4}\/\d{2}\/\d{2}|[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}/,
    );
    expect(text).not.toContain(prs.add.limitReached.split('{{')[0]);
  });

  it('is an invitation, not a red error: no alert, no toast', async () => {
    const tree = await submitToLimit();
    expect(
      tree.root.findAll(
        n =>
          n.props.accessibilityRole === 'alert' && typeof n.type === 'string',
      ),
    ).toHaveLength(0);
    expect(toastOf(tree.root)).toBeUndefined();
    for (const sentence of GENERIC)
      expect(allText(tree.root)).not.toContain(sentence);
  });

  it('has the upgrade button on it, and the button leads to the plans', async () => {
    const nav = navigation();
    const tree = await submitToLimit(nav);
    expect(allText(tree.root)).toContain(prs.add.upgradeAccount);
    expect(allText(tree.root)).not.toContain('نردبان');
    await press(tree.root, prs.add.upgradeAccount);
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 600));
    });
    expect(nav.navigate).toHaveBeenCalledWith('Upgrade');
  });

  it('writes the year too when the renewal falls in another one', async () => {
    now.mockReturnValue(Date.UTC(2027, 2, 10)); // 19 Esfand 1405
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': {
        status: 403,
        body: {
          code: 'FREE_LISTING_LIMIT_REACHED',
          resets_at: '2027-04-01T00:00:00Z', // 12 Hamal 1406
        },
      },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain('(امکان ثبت بعدی: ۱۲ حمل ۱۴۰۶)');
  });

  it('stops before the brackets when the server gave no date', async () => {
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': {
        status: 403,
        body: { code: 'FREE_LISTING_LIMIT_REACHED' },
      },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(allText(tree.root)).toContain(prs.add.limitBannerNoDate);
    expect(allText(tree.root)).not.toContain('()');
  });
});

describe('the welcome gift on the listing form', () => {
  const gifted = { ...user, welcome_listing_credits: 1 };
  const PROMPT = 'با ثبت این آگهی، امتیاز هدیه ثبت اول شما مصرف خواهد شد.';

  it('says, before posting, that the first listing uses the gift', async () => {
    mockAuth = { status: 'signedIn', user: gifted };
    answerGeocoder(KABUL_SPOT, {});
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    expect(allText(tree.root)).toContain(PROMPT);
  });

  it('says nothing once the gift is spent, or for an account that never had one', async () => {
    for (const account of [{ ...user, welcome_listing_credits: 0 }, user]) {
      mockAuth = { status: 'signedIn', user: account };
      answerGeocoder(KABUL_SPOT, {});
      const tree = await render(screenElement(AddPropertyScreen, navigation()));
      await settle();
      expect(allText(tree.root)).not.toContain(PROMPT);
    }
  });

  it('says nothing when editing a listing that is already posted', async () => {
    mockAuth = { status: 'signedIn', user: gifted };
    const existing = listing();
    answerGeocoder(KABUL_SPOT, {
      [`GET /properties/${existing.id}`]: { status: 200, body: existing },
    });
    const tree = await render(
      screenElement(AddPropertyScreen, navigation(), {
        params: { propertyId: existing.id },
      }),
    );
    await settle();
    expect(allText(tree.root)).not.toContain(PROMPT);
  });

  it('asks the server for the account again after posting, so the gift count follows', async () => {
    const updateUser = jest.fn(async () => undefined);
    const session = { status: 'signedIn', user: gifted, updateUser };
    mockAuth = session as unknown as typeof mockAuth;
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
      'GET /users/me': { body: { ...gifted, welcome_listing_credits: 0 } },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(callsTo(fetchMock).some(c => c.path === '/users/me')).toBe(true);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ welcome_listing_credits: 0 }),
    );
  });

  it('asks for the account again after a new listing even with no gift, because a bonus credit may have been spent', async () => {
    const updateUser = jest.fn(async () => undefined);
    mockAuth = {
      status: 'signedIn',
      user,
      updateUser,
    } as unknown as typeof mockAuth;
    answerGeocoder(KABUL_SPOT, {
      'POST /properties': { status: 201, body: listing() },
    });
    const tree = await render(screenElement(AddPropertyScreen, navigation()));
    await settle();
    await fillForm(tree.root);
    await press(tree.root, prs.add.submit);
    await settle();
    expect(callsTo(fetchMock).some(c => c.path === '/users/me')).toBe(true);
  });
});
