import React from 'react';
import { Modal, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  PROPERTY_TYPES,
  PROPERTY_UNIT_MAX_LENGTH,
  type Property,
} from '@bongah/shared-types';
import {
  createFeedbackSchema,
  createPropertySchema,
  listPropertiesQuerySchema,
  updatePropertySchema,
} from '@bongah/validation';
import { initI18n } from '../src/i18n';
import { toPersianDigits } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import {
  allText,
  callsTo,
  inputLabelled,
  jsonResponse,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';
import { captureToasts } from '../test-utils/toasts';
import { APP_VERSION } from '../src/appInfo';
import FeedbackSheet from '../src/components/FeedbackSheet';
import ListingCard from '../src/components/ListingCard';
import PropertyFacts from '../src/components/PropertyFacts';
import PropertyCard from '../src/components/PropertyCard';
import Price, { SIGN_SCALE } from '../src/components/Price';
import TextField from '../src/components/TextField';
import { resetSavedForTests, toggleSaved } from '../src/favorites/store';
import { KV_KEYS, kv } from '../src/storage/kv';
import { PROPERTY_LINE_ICONS } from '../src/map/markers';
import { colors, spacing } from '../src/theme';

declare const __dirname: string;

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};

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
import AboutScreen from '../src/screens/about/AboutScreen';
import AccountScreen from '../src/screens/account/AccountScreen';
import SavedListingsScreen from '../src/screens/saved/SavedListingsScreen';
import PropertyDetailsScreen from '../src/screens/property/PropertyDetailsScreen';

const act = ReactTestRenderer.act;

const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: 'احمد',
  avatar: null,
};

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه خوابه در شهر نو',
  description: '',
  type: 'HOUSE_HAWILI',
  unit: 'واحد ۳',
  deal_type: 'SALE',
  price: 1200000,
  currency: 'AFGHANI',
  area_sqm: 253,
  bedrooms: 3,
  bathrooms: 2,
  province: 'nimroz',
  district: 'زرنج',
  neighborhood: null,
  address: '',
  lat: null,
  lng: null,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  ...overrides,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const withQuery = (node: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {node}
  </QueryClientProvider>
);
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
) =>
  withQuery(
    <Screen
      {...({
        navigation: nav,
        route: { params: undefined, ...route },
      } as unknown as P)}
    />,
  );
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
const byTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const flat = (node: ReactTestRenderer.ReactTestInstance) =>
  StyleSheet.flatten(node.props.style) ?? {};

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user };
  await kv.remove(KV_KEYS.favorites);
  resetSavedForTests();
});
const capturing: ReturnType<typeof captureToasts>[] = [];
const captured = () => {
  const toasts = captureToasts();
  capturing.push(toasts);
  return toasts;
};
afterEach(async () => {
  capturing.splice(0).forEach(toasts => toasts.restore());
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

// ───────────────────────────── 3. the unit (sub-type) ─────────────────────────────

describe('property types: the shared list', () => {
  it('has the nine independent types, none of them grouped', () => {
    expect([...PROPERTY_TYPES]).toEqual([
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
  });

  it('has a Dari and a Pashto name for every type', () => {
    for (const type of PROPERTY_TYPES) {
      expect(prs.propertyType[type]).toBeTruthy();
      expect(ps.propertyType[type]).toBeTruthy();
      expect(prs.add.titleExamples[type]).toBeTruthy();
      expect(ps.add.titleExamples[type]).toBeTruthy();
    }
    expect(Object.keys(prs.propertyType).sort()).toEqual(
      [...PROPERTY_TYPES].sort(),
    );
    expect(Object.keys(ps.propertyType).sort()).toEqual(
      [...PROPERTY_TYPES].sort(),
    );
  });
});

describe('the unit: the shared validation', () => {
  const base = {
    title: 'خانه دو منزله',
    type: 'HOUSE_HAWILI' as const,
    deal_type: 'SALE' as const,
    price: 100000,
    currency: 'AFGHANI' as const,
    area_sqm: 200,
    bedrooms: 3,
    bathrooms: 2,
    province: 'کابل',
    address: 'کابل، شهر نو',
    description: 'خانه نو',
  };

  it('accepts a listing with no unit, a null unit, and a written unit', () => {
    expect(createPropertySchema.safeParse(base).success).toBe(true);
    expect(
      createPropertySchema.safeParse({ ...base, unit: null }).success,
    ).toBe(true);
    expect(
      createPropertySchema.safeParse({ ...base, unit: 'واحد ۳' }).success,
    ).toBe(true);
  });

  it('refuses a unit that is too long, and the old unit_type field', () => {
    expect(
      createPropertySchema.safeParse({
        ...base,
        unit: 'x'.repeat(PROPERTY_UNIT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      createPropertySchema.safeParse({ ...base, unit_type: 'DUPLEX' }).success,
    ).toBe(false);
  });

  it('refuses the types that were merged away', () => {
    for (const old of ['OFFICE_SHOP', 'GARDEN_VILLA', 'GARAGE_OTHER']) {
      expect(
        createPropertySchema.safeParse({ ...base, type: old }).success,
      ).toBe(false);
    }
    for (const type of PROPERTY_TYPES) {
      expect(createPropertySchema.safeParse({ ...base, type }).success).toBe(
        true,
      );
    }
  });

  it('takes a unit on an update, or null to clear it', () => {
    expect(updatePropertySchema.safeParse({ unit: 'واحد ۳' }).success).toBe(
      true,
    );
    expect(updatePropertySchema.safeParse({ unit: null }).success).toBe(true);
  });

  it('takes several types in the list query, comma-separated, but not together with the single type', () => {
    expect(
      listPropertiesQuerySchema.safeParse({ types: 'HOUSE_HAWILI,APARTMENT' })
        .success,
    ).toBe(true);
    expect(
      listPropertiesQuerySchema.safeParse({ types: 'HOUSE_HAWILI,PALACE' })
        .success,
    ).toBe(false);
    expect(
      listPropertiesQuerySchema.safeParse({
        type: 'HOUSE_HAWILI',
        types: 'APARTMENT',
      }).success,
    ).toBe(false);
    expect(
      listPropertiesQuerySchema.safeParse({ unit_type: 'DUPLEX' }).success,
    ).toBe(false);
  });
});

describe('the kind of a property, as a card says it', () => {
  it('says the type and nothing else on a card, and the unit as its own fact on the details page', async () => {
    const card = await show(<PropertyFacts property={property()} withType />);
    expect(allText(card.root)).toContain(prs.propertyType.HOUSE_HAWILI);
    // What an owner typed in the unit box is never glued to the kind ("خانه، <the listing's title>").
    expect(allText(card.root)).not.toContain('واحد ۳');
    expect(allText(card.root)).not.toContain(`${prs.propertyType.HOUSE_HAWILI}،`);

    const details = await show(
      <PropertyFacts property={property()} withType withUnit />,
    );
    expect(allText(details.root)).toContain(prs.propertyType.HOUSE_HAWILI);
    expect(allText(details.root)).toContain('واحد ۳');

    for (const unit of [null, undefined]) {
      const bare = await show(
        <PropertyFacts property={property({ unit })} withType withUnit />,
      );
      expect(allText(bare.root)).not.toContain('واحد');
    }
  });
});

// ─────────────────── 5. the same specs and price in the three views ───────────────────

describe('property specs: the list card, My Listings and the details page agree', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const p = property({ id, province: 'کابل' });

  const expectSpecs = (text: string, { unit = false } = {}) => {
    expect(text).toContain(prs.propertyType.HOUSE_HAWILI);
    // The unit is a detail of the details page; the cards say the kind only.
    if (unit) expect(text).toContain('واحد ۳');
    else expect(text).not.toContain('واحد ۳');
    expect(text).toContain(toPersianDigits(253));
    expect(text).toContain(prs.unit.sqm);
    expect(text).toContain(toPersianDigits(3));
    expect(text).toContain(toPersianDigits(2));
    expect(text).toContain('؋');
    expect(text).toContain('۱,۲۰۰,۰۰۰');
  };

  it('shows type, area, bedrooms, bathrooms and a priced ؋ on the Home list card', async () => {
    const tree = await show(<PropertyCard property={p} onPress={jest.fn()} />);
    expectSpecs(allText(tree.root));
  });

  it('shows the same on a My Listings card', async () => {
    const tree = await show(
      <ListingCard property={p} onPress={jest.fn()} actions={[]} />,
    );
    expectSpecs(allText(tree.root));
  });

  it('shows the same on the details page', async () => {
    mockApi(fetchMock, { [`GET /properties/${id}`]: { body: p } });
    const tree = await show(
      screenElement(PropertyDetailsScreen, navigation(), { params: { id } }),
    );
    await settle();
    expectSpecs(allText(tree.root), { unit: true });
  });

  it('draws the same four icon chips (type, area, bedrooms, bathrooms) in all three views', async () => {
    mockApi(fetchMock, { [`GET /properties/${id}`]: { body: p } });
    const chipIcons = (root: ReactTestRenderer.ReactTestInstance) => {
      const strip = byTestId(root, 'property-facts')[0];
      expect(strip).toBeDefined();
      return (
        strip
          .findAll(n => typeof n.props.name === 'string' && n.props.size === 16)
          .map(icon => icon.props.name as string)
          // The details page also carries the little ℹ of the jerib helper beside the area.
          .filter(name => name !== 'info')
      );
    };
    const home = await show(<PropertyCard property={p} onPress={jest.fn()} />);
    const mine = await show(
      <ListingCard property={p} onPress={jest.fn()} actions={[]} />,
    );
    const details = await show(
      screenElement(PropertyDetailsScreen, navigation(), { params: { id } }),
    );
    await settle();
    const expected = [
      PROPERTY_LINE_ICONS.HOUSE_HAWILI,
      'area',
      'bed',
      'shower',
    ];
    expect(chipIcons(home.root)).toEqual(expected);
    expect(chipIcons(mine.root)).toEqual(expected);
    // The details page adds the unit after the kind.
    expect(chipIcons(details.root)).toEqual([
      PROPERTY_LINE_ICONS.HOUSE_HAWILI,
      'apartment',
      'area',
      'bed',
      'shower',
    ]);
  });

  it('draws the currency sign at four fifths of the figure, not a speck', async () => {
    expect(SIGN_SCALE).toBeGreaterThanOrEqual(0.75);
    expect(SIGN_SCALE).toBeLessThan(1);
    const tree = await show(
      <Price amount={1200000} currency="AFGHANI" variant="title" />,
    );
    expect(allText(tree.root)).toContain('؋');
  });
});

// ───────────────────── 7. the ℹ جریب beside the "مساحت" label ─────────────────────

describe('TextField: an accessory beside the label', () => {
  it('draws the accessory in the label row, before the input', async () => {
    const tree = await show(
      <TextField
        label="مساحت"
        value=""
        onChangeText={jest.fn()}
        labelAccessory={<TextField_Probe />}
      />,
    );
    const row = byTestId(tree.root, 'label-row');
    expect(row).toHaveLength(1);
    expect(allText(row[0])).toContain('مساحت');
    expect(allText(row[0])).toContain('probe');
  });
});
function TextField_Probe() {
  const { Text } = jest.requireActual('react-native');
  return <Text>probe</Text>;
}

// ───────────────────────────── 8. placeholder colour ─────────────────────────────

describe('placeholders look like hints, never like filled values', () => {
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('is readable (3:1 against white) yet clearly lighter than the typed text and the muted text', () => {
    expect(contrast(colors.placeholder, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(colors.placeholder).not.toBe(colors.text);
    expect(colors.placeholder).not.toBe(colors.textMuted);
    // A typed value is at least twice as strong against white as a hint is.
    expect(contrast(colors.text, '#FFFFFF')).toBeGreaterThan(
      contrast(colors.placeholder, '#FFFFFF') * 2,
    );
    expect(luminance(colors.placeholder)).toBeGreaterThan(
      luminance(colors.textMuted),
    );
  });

  it('gives every text box the hint colour for an empty value and the text colour once filled', async () => {
    const field = (value: string) =>
      show(
        <TextField
          label="نام"
          value={value}
          onChangeText={jest.fn()}
          placeholder="۱۰۰۰"
        />,
      );
    const empty = await field('');
    const input = inputLabelled(empty.root, 'نام');
    expect(input.props.placeholderTextColor).toBe(colors.placeholder);
    const filled = await field('احمد');
    expect(flat(inputLabelled(filled.root, 'نام')).color).toBe(colors.text);
  });
});

// ─────────────────────── 4. no "مثلاً" in any placeholder ───────────────────────

describe('placeholders carry no "for example" word', () => {
  const words = ['مثلاً', 'مثلا', 'لکه'];
  const strings = (value: unknown, path: string): [string, string][] =>
    typeof value === 'string'
      ? [[path, value]]
      : value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) =>
          strings(child, path ? `${path}.${key}` : key),
        )
      : [];

  it.each([
    ['Dari', prs],
    ['Pashto', ps],
  ])('has none in the %s texts that go into a text box', (_name, locale) => {
    const offenders = strings(locale, '')
      .filter(([key]) => /placeholder|titleExamples/i.test(key))
      .filter(([, text]) => words.some(word => text.includes(word)))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('has dropped the shared "for example" prefix key', () => {
    expect((prs.common as Record<string, unknown>).example).toBeUndefined();
    expect((ps.common as Record<string, unknown>).example).toBeUndefined();
  });

  it('has no source file that builds a placeholder from such a word', () => {
    const fs = require('node:fs') as {
      readdirSync(
        p: string,
        o: { withFileTypes: true },
      ): { name: string; isDirectory(): boolean }[];
      readFileSync(p: string, e: 'utf8'): string;
    };
    const path = require('node:path') as { join(...p: string[]): string };
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });
    const hits = walk(path.join(__dirname, '..', 'src')).filter(file =>
      /placeholder[^\n]*(مثلاً|common\.example)/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(hits).toEqual([]);
  });
});

// ─────────────────────────── 1. feedback, and the About view ───────────────────────────

describe('FeedbackSheet', () => {
  const open = async (onSignIn = jest.fn(), onClose = jest.fn()) => {
    const tree = await show(
      withQuery(
        <FeedbackSheet visible onClose={onClose} onSignIn={onSignIn} />,
      ),
    );
    await settle();
    return { tree, onSignIn, onClose };
  };
  const write = (root: ReactTestRenderer.ReactTestInstance, text: string) =>
    act(async () => {
      inputLabelled(root, prs.feedback.messageLabel).props.onChangeText(text);
    });

  it('offers the four kinds of message and a message box with a hint', async () => {
    const { tree } = await open();
    const text = allText(tree.root);
    expect(text).toContain(prs.feedback.title);
    for (const label of Object.values(prs.feedback.category)) {
      expect(text).toContain(label);
    }
    expect(
      inputLabelled(tree.root, prs.feedback.messageLabel).props.placeholder,
    ).toBe(prs.feedback.messagePlaceholder);
  });

  it('refuses a message that is too short and sends nothing', async () => {
    const { tree } = await open();
    await write(tree.root, 'سلام');
    await press(tree.root, prs.feedback.send);
    await settle();
    expect(callsTo(fetchMock).filter(c => c.path === '/feedback')).toHaveLength(
      0,
    );
    expect(allText(tree.root)).toContain(
      prs.feedback.tooShort.replace(
        '{{min}}',
        toPersianDigits(FEEDBACK_MIN_LENGTH),
      ),
    );
  });

  /** The sheet the way its owner holds it: open until `onClose` says otherwise. */
  const openStateful = async () => {
    const closed = jest.fn();
    const Host = () => {
      const [visible, setVisible] = React.useState(true);
      return (
        <FeedbackSheet
          visible={visible}
          onClose={() => {
            closed();
            setVisible(false);
          }}
          onSignIn={jest.fn()}
        />
      );
    };
    const tree = await show(withQuery(<Host />));
    await settle();
    return { tree, closed };
  };
  const sheetOpen = (root: ReactTestRenderer.ReactTestInstance) =>
    root.findAllByType(Modal).some(m => m.props.visible);
  const sendOne = async (root: ReactTestRenderer.ReactTestInstance) => {
    await press(root, prs.feedback.category.PROBLEM);
    await write(root, 'نقشه در بخش ثبت آگهی کند باز می‌شود.');
    await press(root, prs.feedback.send);
    await settle();
  };

  it('sends the chosen kind, the message and the app version', async () => {
    mockApi(fetchMock, {
      'POST /feedback': {
        status: 201,
        body: { id: 'f1', created_at: '2026-10-16T00:00:00Z' },
      },
    });
    const { tree } = await open();
    await sendOne(tree.root);
    const sent = callsTo(fetchMock).find(c => c.path === '/feedback');
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toEqual({
      category: 'PROBLEM',
      message: 'نقشه در بخش ثبت آگهی کند باز می‌شود.',
      app_version: APP_VERSION,
    });
  });

  it('closes by itself once the server has the message, and thanks the person with a 4-second toast after the sheet has slid away', async () => {
    const toasts = captured();
    mockApi(fetchMock, {
      'POST /feedback': {
        status: 201,
        body: { id: 'f1', created_at: '2026-10-16T00:00:00Z' },
      },
    });
    const { tree, closed } = await openStateful();
    expect(sheetOpen(tree.root)).toBe(true);
    await sendOne(tree.root);
    // Closed without a tap, and no "sent" page left in the sheet to close by hand.
    expect(closed).toHaveBeenCalledTimes(1);
    expect(allText(tree.root)).not.toContain(prs.feedback.thanks);
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 400));
    });
    expect(sheetOpen(tree.root)).toBe(false);
    // Said once, in the root's toast (the sheet's own host is gone by now), for four seconds.
    expect(toasts.calls).toEqual([[prs.feedback.thanks, 'success', 4000]]);
  });

  it('thanks at once when the sheet was already closed by hand while the message was on its way', async () => {
    const toasts = captured();
    let answer!: (reply: unknown) => void;
    fetchMock.mockImplementation(
      () => new Promise(resolve => (answer = resolve)),
    );
    const { tree } = await openStateful();
    await press(tree.root, prs.feedback.category.PROBLEM);
    await write(tree.root, 'نقشه در بخش ثبت آگهی کند باز می‌شود.');
    await press(tree.root, prs.feedback.send);
    await act(async () => {
      tree.root
        .findAll(
          n =>
            n.props.accessibilityLabel === prs.common.close &&
            typeof n.props.onPress === 'function',
        )[0]
        .props.onPress();
    });
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 400));
    });
    expect(toasts.calls).toHaveLength(0);
    await act(async () => answer(jsonResponse(201, { id: 'f1', created_at: '2026-10-16T00:00:00Z' })));
    await settle();
    expect(toasts.calls).toEqual([[prs.feedback.thanks, 'success', 4000]]);
  });

  it('stays open, keeps what was typed and says why in a toast when the server refuses', async () => {
    const toasts = captured();
    mockApi(fetchMock, {
      'POST /feedback': { status: 500, body: { message: 'boom' } },
    });
    const { tree, closed } = await openStateful();
    await sendOne(tree.root);
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 400));
    });
    expect(closed).not.toHaveBeenCalled();
    expect(sheetOpen(tree.root)).toBe(true);
    expect(
      inputLabelled(tree.root, prs.feedback.messageLabel).props.value,
    ).toBe('نقشه در بخش ثبت آگهی کند باز می‌شود.');
    expect(toasts.calls).toHaveLength(1);
    expect(toasts.calls[0][1]).toBe('error');
    expect(toasts.calls[0][0]).not.toBe(prs.feedback.thanks);
    expect(toasts.calls[0][0].length).toBeGreaterThan(0);
  });

  it('shows a visitor the sign-in prompt, which closes the sheet and goes to sign-in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree, onSignIn, onClose } = await open();
    expect(allText(tree.root)).toContain(prs.auth.signInRequired);
    expect(
      inputLabelledOrNull(tree.root, prs.feedback.messageLabel),
    ).toBeNull();
    await press(tree.root, prs.auth.signIn);
    expect(onClose).toHaveBeenCalled();
    expect(onSignIn).toHaveBeenCalled();
  });

  it('knows its limits from the shared package', () => {
    expect(FEEDBACK_MIN_LENGTH).toBeGreaterThan(0);
    expect(FEEDBACK_MAX_LENGTH).toBeGreaterThan(FEEDBACK_MIN_LENGTH);
    expect(
      createFeedbackSchema.safeParse({
        category: 'PRAISE',
        message: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      createFeedbackSchema.safeParse({
        category: 'PRAISE',
        message: 'برنامه خیلی خوب است',
      }).success,
    ).toBe(true);
    expect(
      createFeedbackSchema.safeParse({
        category: 'RUDE',
        message: 'برنامه خیلی خوب است',
      }).success,
    ).toBe(false);
  });
});
function inputLabelledOrNull(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  try {
    return inputLabelled(root, label);
  } catch {
    return null;
  }
}

describe('AboutScreen', () => {
  it('tells what the app is for, its version, its languages and where the map comes from', async () => {
    const tree = await show(screenElement(AboutScreen));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain(prs.app.name);
    expect(text).toContain(prs.about.mission);
    expect(text).toContain(prs.about.point1);
    expect(text).toContain(toPersianDigits(APP_VERSION));
    expect(text).toContain(prs.about.languagesValue);
    expect(text).toContain('OpenStreetMap');
  });

  it('shows the app logo, not a house icon, and no version line under the tagline', async () => {
    const tree = await show(screenElement(AboutScreen));
    await settle();
    expect(byTestId(tree.root, 'about-logo').length).toBeGreaterThan(0);
    const text = allText(tree.root);
    // the tagline is followed straight by the first card: the version appears once, in the details
    expect(text.indexOf(prs.app.tagline)).toBeGreaterThan(-1);
    const afterTagline = text.slice(
      text.indexOf(prs.app.tagline) + prs.app.tagline.length,
    );
    expect(afterTagline.trimStart().startsWith(prs.about.missionTitle)).toBe(
      true,
    );
    expect(text.split(toPersianDigits(APP_VERSION)).length - 1).toBe(1);
  });

  it('lists the project manager right after the languages', async () => {
    const tree = await show(screenElement(AboutScreen));
    await settle();
    const text = allText(tree.root);
    expect(prs.about.manager).toBe('مدیر تیم و پروژه');
    expect(prs.about.managerValue).toBe('منصور قادری');
    const at = (s: string) => text.indexOf(s);
    expect(at(prs.about.languagesValue)).toBeGreaterThan(-1);
    expect(at(prs.about.manager)).toBeGreaterThan(at(prs.about.languagesValue));
    expect(at(prs.about.managerValue)).toBeGreaterThan(at(prs.about.manager));
    expect(text.lastIndexOf('OpenStreetMap')).toBeGreaterThan(
      at(prs.about.managerValue),
    );
  });

  it('opens the feedback sheet from its contact card', async () => {
    const tree = await show(screenElement(AboutScreen));
    await settle();
    expect(allText(tree.root)).not.toContain(prs.feedback.intro);
    await press(tree.root, prs.about.sendFeedback);
    await settle();
    expect(allText(tree.root)).toContain(prs.feedback.intro);
  });
});

// ───────────────────────── 1 + 2. the redesigned Account tab ─────────────────────────

describe('AccountScreen: the settings layout', () => {
  const mount = async (nav = navigation()) => {
    const tree = await show(screenElement(AccountScreen, nav));
    await settle();
    return { tree, nav };
  };

  it('puts saved, my listings and add-property in a row of quick tiles', async () => {
    mockApi(fetchMock, {});
    const { tree, nav } = await mount();
    const tiles = byTestId(tree.root, 'quick-actions')[0];
    expect(tiles).toBeDefined();
    const text = allText(tiles);
    expect(text).toContain(prs.nav.saved);
    expect(text).toContain(prs.nav.myListings);
    expect(text).toContain(prs.nav.addProperty);

    await press(tiles, prs.nav.saved);
    expect(nav.navigate).toHaveBeenCalledWith('Saved');
    await press(tiles, prs.nav.myListings);
    expect(nav.navigate).toHaveBeenCalledWith('MyListings');
    await press(tiles, prs.nav.addProperty);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty');
  });

  it('has feedback and about cards under “پشتیبانی”, with a hint line each', async () => {
    mockApi(fetchMock, {});
    const { tree } = await mount();
    const text = allText(tree.root);
    expect(text).toContain(prs.account.groupSupport);
    expect(text).toContain(prs.account.feedback);
    expect(text).toContain(prs.account.feedbackHint);
    expect(text).toContain(prs.account.about);
    expect(text).toContain(prs.account.aboutHint);
  });

  it('opens the About view from its card', async () => {
    mockApi(fetchMock, {});
    const { tree, nav } = await mount();
    await press(tree.root, prs.account.aboutHint);
    expect(nav.navigate).toHaveBeenCalledWith('About');
  });

  it('opens the feedback form from its card, in a sheet, without leaving the tab', async () => {
    mockApi(fetchMock, {});
    const { tree, nav } = await mount();
    expect(allText(tree.root)).not.toContain(prs.feedback.intro);
    await press(tree.root, prs.account.feedbackHint);
    await settle();
    expect(allText(tree.root)).toContain(prs.feedback.intro);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('spaces the language row and the morning-messages row like the support menu rows', async () => {
    mockApi(fetchMock, {});
    const { tree } = await mount();
    const group = byTestId(tree.root, 'settings-group')[0];
    const boxes = group.findAll(
      n =>
        typeof n.type === 'string' && n.props.style && flat(n).minHeight === 56,
    );
    // morning-messages line + language line, each with the menu-row height and padding
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const box of boxes) {
      expect(flat(box).paddingVertical).toBe(spacing.sm);
    }
  });

  it('shows the app version at the foot of the page', async () => {
    mockApi(fetchMock, {});
    const { tree } = await mount();
    expect(allText(tree.root)).toContain(
      prs.account.version.replace('{{version}}', toPersianDigits(APP_VERSION)),
    );
  });

  it('keeps sign-out and the morning-messages switch inside the groups', async () => {
    mockApi(fetchMock, {});
    const { tree } = await mount();
    const settings = byTestId(tree.root, 'settings-group')[0];
    expect(settings).toBeDefined();
    expect(allText(settings)).toContain(prs.account.morningMessages);
    expect(allText(settings)).toContain(prs.account.language);
    expect(allText(tree.root)).toContain(prs.auth.signOut);
  });

  it('still lets a visitor in: sign-in card, support rows, no account group', async () => {
    mockAuth = { status: 'signedOut', user: null };
    mockApi(fetchMock, {});
    const { tree } = await mount();
    const text = allText(tree.root);
    expect(text).toContain(prs.auth.signIn);
    expect(text).toContain(prs.account.about);
    expect(text).toContain(prs.account.feedback);
    // The "account" group's title is a text of its own. (The plans row, «ارتقای حساب و خرید اشتراک», has the word in a
    // longer sentence, so a plain substring test would be fooled by it.)
    expect(
      tree.root.findAll(n => n.props.children === prs.account.groupAccount),
    ).toHaveLength(0);
    expect(text).not.toContain(prs.account.morningMessages);
  });
});

// ──────────────────────────────── 2. saved listings ────────────────────────────────

describe('SavedListingsScreen', () => {
  const idA = '11111111-1111-4111-8111-111111111111';
  const idB = '22222222-2222-4222-8222-222222222222';
  const idC = '33333333-3333-4333-8333-333333333333';

  it('says there is nothing yet, and leads back to the listings', async () => {
    const nav = navigation();
    const tree = await show(screenElement(SavedListingsScreen, nav));
    await settle();
    expect(allText(tree.root)).toContain(prs.saved.empty);
    await press(tree.root, prs.saved.browse);
    expect(nav.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Home' });
  });

  it('lists every saved listing as a card, newest save first, and opens one on a tap', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${idA}`]: {
        body: property({ id: idA, title: 'آگهی اول' }),
      },
      [`GET /properties/${idB}`]: {
        body: property({ id: idB, title: 'آگهی دوم' }),
      },
    });
    await toggleSaved(idA);
    await toggleSaved(idB);
    const nav = navigation();
    const tree = await show(screenElement(SavedListingsScreen, nav));
    await settle();
    const text = allText(tree.root);
    expect(text).toContain('آگهی اول');
    expect(text).toContain('آگهی دوم');
    expect(text.indexOf('آگهی دوم')).toBeLessThan(text.indexOf('آگهی اول'));
    expect(text).toContain(
      prs.saved.count.replace('{{count}}', toPersianDigits(2)),
    );
    // The same card as the Home list: the specs are on it too (the owner's unit text is on the details page only).
    expect(text).toContain('۳ اتاق خواب');
    expect(text).not.toContain('واحد ۳');

    await press(tree.root, 'آگهی اول');
    expect(nav.navigate).toHaveBeenCalledWith('PropertyDetails', { id: idA });
  });

  it('keeps a removed listing as a short note that can be forgotten, without hiding the others', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${idA}`]: {
        body: property({ id: idA, title: 'آگهی اول' }),
      },
      // idB is not routed: the mock answers 404.
    });
    await toggleSaved(idA);
    await toggleSaved(idB);
    const tree = await show(screenElement(SavedListingsScreen));
    await settle();
    expect(allText(tree.root)).toContain('آگهی اول');
    expect(byTestId(tree.root, `saved-gone-${idB}`)).toHaveLength(1);
    expect(allText(tree.root)).toContain(prs.saved.gone);

    await act(async () => {
      tree.root
        .find(
          n =>
            typeof n.props.onPress === 'function' &&
            n.props.accessibilityLabel === `${prs.saved.remove}: ${idB}`,
        )
        .props.onPress();
    });
    await settle();
    expect(byTestId(tree.root, `saved-gone-${idB}`)).toHaveLength(0);
    expect(allText(tree.root)).toContain('آگهی اول');
  });

  it('offers a retry for a listing that failed to load, and loads it on the retry', async () => {
    let failing = true;
    mockApi(fetchMock, {
      [`GET /properties/${idC}`]: () =>
        failing
          ? { status: 500, body: { message: 'خطا' } }
          : { body: property({ id: idC, title: 'آگهی سوم' }) },
    });
    await toggleSaved(idC);
    const tree = await show(screenElement(SavedListingsScreen));
    await settle();
    // One automatic retry first (after its short wait), then the note with a button.
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 1300));
    });
    expect(byTestId(tree.root, `saved-failed-${idC}`)).toHaveLength(1);

    failing = false;
    await press(tree.root, prs.common.retry);
    await settle();
    expect(allText(tree.root)).toContain('آگهی سوم');
  });
});

// ─────────────────────────── the navigation bar stays as it was ───────────────────────────

describe('the floating bottom navigation bar', () => {
  it('has not been given any of the new screens or routes', () => {
    const fs = require('node:fs') as {
      readFileSync(p: string, e: 'utf8'): string;
    };
    const path = require('node:path') as { join(...p: string[]): string };
    const read = (file: string) =>
      fs.readFileSync(
        path.join(__dirname, '..', 'src', 'navigation', file),
        'utf8',
      );
    for (const file of ['FloatingTabBar.tsx', 'MainTabs.tsx']) {
      const source = read(file);
      expect(source).not.toMatch(/Saved|About|Feedback/);
    }
  });
});
