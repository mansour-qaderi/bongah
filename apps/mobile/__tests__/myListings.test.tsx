import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { allText, mockApi, render as renderTree } from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screens pick it up.
import ListingCard from '../src/components/ListingCard';
import MyListingsScreen from '../src/screens/my/MyListingsScreen';

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه حویلی در شهر نو',
  description: '',
  type: 'HOUSE_HAWILI',
  deal_type: 'SALE',
  price: 5200000,
  currency: 'AFGHANI',
  area_sqm: 300,
  bedrooms: 4,
  bathrooms: 2,
  province: 'kabul',
  district: 'شهر نو',
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

const page = (data: Property[]) => ({
  data,
  meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
});

const navigation = () => ({ navigate: jest.fn(), goBack: jest.fn() });
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const settle = async () => {
  for (let i = 0; i < 4; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
/**
 * Taps the control whose text is exactly `label` (or whose accessibility label is). Not `pressableWith`, which
 * takes the outermost element containing the text: a card holds several buttons, so that would be the card.
 */
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  ReactTestRenderer.act(async () => {
    const match = root
      .findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          (node.props.accessibilityLabel === label ||
            allText(node).trim() === label),
      )
      .shift();
    if (!match) throw new Error(`No button "${label}"`);
    match.props.onPress();
  });

const mine = async (data: Property[], nav = navigation()) => {
  mockApi(fetchMock, { 'GET /properties/mine': { body: page(data) } });
  const tree = await renderTree(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MyListingsScreen
        {...({ navigation: nav, route: {} } as unknown as React.ComponentProps<
          typeof MyListingsScreen
        >)}
      />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  await settle();
  return { tree, nav };
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = {
    status: 'signedIn',
    user: { id: 'u1', role: 'USER', phone_number: '+93701234567' },
  };
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('ListingCard', () => {
  const card = async (p: Property, actions = [] as never[]) => {
    const onPress = jest.fn();
    const tree = await renderTree(
      <ListingCard property={p} onPress={onPress} actions={actions} />,
    );
    mounted.push(tree);
    return { tree, onPress };
  };

  it('shows the title, the price with ؋ in Persian digits, the deal and the status', async () => {
    const { tree } = await card(property());
    const text = allText(tree.root);
    expect(text).toContain('خانه حویلی در شهر نو');
    expect(text).toContain('؋');
    expect(text).toContain('۵,۲۰۰,۰۰۰');
    expect(text).toContain(prs.dealType.SALE);
    expect(text).toContain(prs.status.ACTIVE);
    expect(text).not.toMatch(/[0-9]/);
  });

  it('shows the kind as a badge and the picture when there is one', async () => {
    const { tree } = await card(
      property({ images: ['https://img.example/a.jpg'] }),
    );
    expect(allText(tree.root)).toContain(prs.propertyType.HOUSE_HAWILI);
    const images = tree.root.findAll(
      node =>
        node.props.source?.uri === 'https://img.example/a.jpg' &&
        typeof node.type !== 'string',
    );
    expect(images.length).toBeGreaterThan(0);
  });

  it('shows the status the listing really has', async () => {
    const { tree } = await card(property({ status: 'SOLD' }));
    expect(allText(tree.root)).toContain(prs.status.SOLD);
  });

  it('marks a featured listing and says until when', async () => {
    const { tree } = await card(
      property({ is_featured: true, featured_until: '2026-10-20T00:00:00Z' }),
    );
    const text = allText(tree.root);
    expect(text).toContain(prs.property.featured);
    expect(text).toContain(prs.my.featuredUntil.split('{{date}}')[0].trim());
  });

  it('opens the listing from the picture-and-text part', async () => {
    const { tree, onPress } = await card(property());
    await press(tree.root, 'خانه حویلی در شهر نو');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('runs the action that was tapped', async () => {
    const act = jest.fn();
    const tree = await renderTree(
      <ListingCard
        property={property()}
        onPress={jest.fn()}
        actions={[{ label: prs.my.promote, onPress: act, tone: 'brand' }]}
      />,
    );
    mounted.push(tree);
    await press(tree.root, prs.my.promote);
    expect(act).toHaveBeenCalledTimes(1);
  });
});

describe('MyListingsScreen', () => {
  const LIST = [
    property({ id: 'a', title: 'آگهی فعال' }),
    property({ id: 'b', title: 'آگهی فروخته', status: 'SOLD' }),
    property({ id: 'c', title: 'آگهی بایگانی', status: 'ARCHIVED' }),
  ];

  it('asks a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree, nav } = await mine([]);
    expect(allText(tree.root)).toContain(prs.my.signInHint);
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });

  it('invites a first listing when there are none', async () => {
    const { tree, nav } = await mine([]);
    expect(allText(tree.root)).toContain(prs.my.empty);
    await press(tree.root, prs.my.newListing);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty');
  });

  it('lists every listing with a count per status on the filter chips', async () => {
    const { tree } = await mine(LIST);
    const text = allText(tree.root);
    for (const title of ['آگهی فعال', 'آگهی فروخته', 'آگهی بایگانی']) {
      expect(text).toContain(title);
    }
    expect(text).toContain(`${prs.my.filterAll} ${formatNumber(3, 0)}`);
    expect(text).toContain(`${prs.status.ACTIVE} ${formatNumber(1, 0)}`);
  });

  it('narrows to one status when its chip is tapped', async () => {
    const { tree } = await mine(LIST);
    await press(tree.root, `${prs.status.SOLD} ${formatNumber(1, 0)}`);
    const text = allText(tree.root);
    expect(text).toContain('آگهی فروخته');
    expect(text).not.toContain('آگهی فعال');
    expect(text).not.toContain('آگهی بایگانی');
  });

  it('floats a "new listing" button over the list', async () => {
    const { tree, nav } = await mine(LIST);
    await press(tree.root, prs.my.newListing);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty');
  });

  it('offers promote, edit and archive only on a live listing', async () => {
    const { tree } = await mine([
      property({ id: 'a', title: 'آگهی فعال' }),
      property({ id: 'b', title: 'آگهی فروخته', status: 'SOLD' }),
    ]);
    // A button is a few nested elements sharing one handler, so count handlers, not elements.
    const buttons = (label: string) =>
      new Set(
        tree.root
          .findAll(
            node =>
              typeof node.props.onPress === 'function' &&
              allText(node).trim() === label,
          )
          .map(node => node.props.onPress),
      ).size;
    // One live listing, so one of each: the sold one offers none (the "archived" chip is a different button).
    expect(buttons(prs.my.promote)).toBe(1);
    expect(buttons(prs.my.edit)).toBe(1);
    expect(buttons(prs.my.archive)).toBe(1);
  });

  it('takes the owner to the listing, and to the edit form', async () => {
    const { tree, nav } = await mine([property({ id: 'a' })]);
    await press(tree.root, 'خانه حویلی در شهر نو');
    expect(nav.navigate).toHaveBeenCalledWith('PropertyDetails', { id: 'a' });
    await press(tree.root, prs.my.edit);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty', {
      propertyId: 'a',
    });
  });

  it('asks before archiving', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree } = await mine([property({ id: 'a' })]);
    await press(tree.root, prs.my.archive);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toBe(prs.my.archiveConfirm);
    alert.mockRestore();
  });
});
