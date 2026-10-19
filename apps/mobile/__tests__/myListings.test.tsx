import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Property } from '@bongah/shared-types';
import { queryClient } from '../src/api/hooks';
import { initI18n } from '../src/i18n';
import { formatCurrency, formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { resetDeletedForTests } from '../src/listings/deleted';
import { KV_KEYS, kv } from '../src/storage/kv';
import {
  allText,
  callsTo,
  jsonResponse,
  mockApi,
  render as renderTree,
} from '../test-utils';

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

const mine = async (
  data: Property[],
  nav = navigation(),
  routes: Parameters<typeof mockApi>[1] = {},
) => {
  mockApi(fetchMock, {
    'GET /properties/mine': { body: page(data) },
    ...routes,
  });
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
beforeEach(async () => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  await kv.remove(KV_KEYS.deletedListings);
  resetDeletedForTests();
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

  // A button is a few nested elements sharing one handler, so count handlers, not elements.
  const buttonCount = (
    root: ReactTestRenderer.ReactTestInstance,
    label: string,
  ) =>
    new Set(
      root
        .findAll(
          node =>
            typeof node.props.onPress === 'function' &&
            allText(node).trim() === label,
        )
        .map(node => node.props.onPress),
    ).size;
  const everyAction = [
    prs.my.promote,
    prs.my.markSold,
    prs.my.archive,
    prs.my.activate,
    prs.my.edit,
    prs.common.delete,
  ];
  const offered = (root: ReactTestRenderer.ReactTestInstance) =>
    everyAction.filter(label => buttonCount(root, label) > 0);

  it('offers promote, traded, switch off, edit and delete on a live listing', async () => {
    const { tree } = await mine([property({ id: 'a' })]);
    expect(offered(tree.root)).toEqual([
      prs.my.promote,
      prs.my.markSold,
      prs.my.archive,
      prs.my.edit,
      prs.common.delete,
    ]);
  });

  it('offers switch on, edit and delete (no promote, no traded) on a traded or switched-off listing', async () => {
    const { tree } = await mine([
      property({ id: 'b', status: 'SOLD' }),
      property({ id: 'c', status: 'ARCHIVED' }),
    ]);
    // Two listings, so two of each button.
    for (const label of [prs.my.activate, prs.my.edit, prs.common.delete]) {
      expect(buttonCount(tree.root, label)).toBe(2);
    }
    for (const label of [prs.my.promote, prs.my.markSold, prs.my.archive]) {
      expect(buttonCount(tree.root, label)).toBe(0);
    }
  });

  it("shows each listing's status as a badge, with the words the owner knows", async () => {
    const { tree } = await mine([
      property({ id: 'a', title: 'آگهی فعال' }),
      property({ id: 'b', title: 'آگهی فروخته', status: 'SOLD' }),
      property({ id: 'c', title: 'آگهی بایگانی', status: 'ARCHIVED' }),
    ]);
    expect(prs.status).toEqual({
      ACTIVE: 'فعال',
      SOLD: 'معامله شد',
      ARCHIVED: 'غیرفعال',
    });
    const badges = tree.root.findAll(
      node => node.props.testID === 'listing-badges',
    );
    const words = badges.map(badge => allText(badge));
    expect(words.some(text => text.includes(prs.status.ACTIVE))).toBe(true);
    expect(words.some(text => text.includes(prs.status.SOLD))).toBe(true);
    expect(words.some(text => text.includes(prs.status.ARCHIVED))).toBe(true);
  });

  describe('changing a listing', () => {
    const alertButton = (alert: jest.SpyInstance, label: string) =>
      (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[]).find(
        button => button.text === label,
      );
    const patches = () =>
      callsTo(fetchMock).filter(call => call.method === 'PATCH');
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      alert.mockClear();
    });
    afterEach(() => alert.mockRestore());

    it('marks it as traded after asking: nothing is sent until the owner confirms', async () => {
      const { tree } = await mine([property({ id: 'a' })], navigation(), {
        'PATCH /properties/a': { body: property({ id: 'a', status: 'SOLD' }) },
      });
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      await press(tree.root, prs.my.markSold);
      expect(alert.mock.calls[0][1]).toBe(prs.my.markSoldConfirm);
      expect(patches()).toEqual([]);

      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.markSold)?.onPress?.();
      });
      await settle();
      expect(patches()).toEqual([
        {
          method: 'PATCH',
          path: '/properties/a',
          query: {},
          body: { status: 'SOLD' },
        },
      ]);
      // Every list of listings (mine, the map, saved, the dashboard) is read again, so nothing shows the old status.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['properties'] });
      invalidate.mockRestore();
    });

    it('switches an active listing off, after asking', async () => {
      const { tree } = await mine([property({ id: 'a' })], navigation(), {
        'PATCH /properties/a': {
          body: property({ id: 'a', status: 'ARCHIVED' }),
        },
      });
      await press(tree.root, prs.my.archive);
      expect(alert.mock.calls[0][1]).toBe(prs.my.archiveConfirm);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.archive)?.onPress?.();
      });
      await settle();
      expect(patches().map(call => call.body)).toEqual([
        { status: 'ARCHIVED' },
      ]);
    });

    it('switches a listing back on with one tap (traded or switched off)', async () => {
      const { tree } = await mine(
        [property({ id: 'c', status: 'ARCHIVED' })],
        navigation(),
        {
          'PATCH /properties/c': { body: property({ id: 'c' }) },
        },
      );
      await press(tree.root, prs.my.activate);
      await settle();
      expect(alert).not.toHaveBeenCalled();
      expect(patches()).toEqual([
        {
          method: 'PATCH',
          path: '/properties/c',
          query: {},
          body: { status: 'ACTIVE' },
        },
      ]);
    });

    it('deletes after asking, and the listing leaves the screen and stays gone', async () => {
      const { tree } = await mine(
        [
          property({ id: 'a', title: 'آگهی اول' }),
          property({ id: 'b', title: 'آگهی دوم' }),
        ],
        navigation(),
        { 'DELETE /properties/a': { status: 204 } },
      );
      // Two live listings: delete the first one's button.
      const deleteButtons = tree.root.findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          allText(node).trim() === prs.common.delete,
      );
      const first = [
        ...new Set(deleteButtons.map(node => node.props.onPress)),
      ][0];
      await ReactTestRenderer.act(async () => {
        first();
      });
      expect(alert.mock.calls[0][1]).toBe(prs.my.deleteConfirm);
      expect(callsTo(fetchMock).some(call => call.method === 'DELETE')).toBe(
        false,
      );
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.common.delete)?.onPress?.();
      });
      await settle();

      expect(
        callsTo(fetchMock).filter(call => call.method === 'DELETE'),
      ).toEqual([
        { method: 'DELETE', path: '/properties/a', query: {}, body: undefined },
      ]);
      // The server still lists it (it only archives), but this phone no longer shows it.
      const text = allText(tree.root);
      expect(text).not.toContain('آگهی اول');
      expect(text).toContain('آگهی دوم');
      expect(await kv.get(KV_KEYS.deletedListings)).toBe(JSON.stringify(['a']));
    });

    it('keeps a listing on screen and says so when the delete fails', async () => {
      const { tree } = await mine(
        [property({ id: 'a', title: 'آگهی اول' })],
        navigation(),
        { 'DELETE /properties/a': { status: 500, body: { message: 'boom' } } },
      );
      await press(tree.root, prs.common.delete);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.common.delete)?.onPress?.();
      });
      await settle();
      expect(allText(tree.root)).toContain('آگهی اول');
      expect(
        tree.root.findAll(node => node.props.accessibilityRole === 'alert')
          .length,
      ).toBeGreaterThan(0);
      expect(await kv.get(KV_KEYS.deletedListings)).toBeNull();
    });

    it('shows the error and leaves the status alone when a change fails', async () => {
      const { tree } = await mine([property({ id: 'a' })], navigation(), {
        'PATCH /properties/a': { status: 500, body: { message: 'boom' } },
      });
      await press(tree.root, prs.my.markSold);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.markSold)?.onPress?.();
      });
      await settle();
      expect(
        tree.root.findAll(node => node.props.accessibilityRole === 'alert')
          .length,
      ).toBeGreaterThan(0);
      // Still a live listing: its live-only buttons are still there.
      expect(buttonCount(tree.root, prs.my.markSold)).toBe(1);
    });

    it("holds a listing's other buttons while one change is running, so two cannot race", async () => {
      let finish!: (value: unknown) => void;
      fetchMock.mockImplementation(
        async (url: string, init: RequestInit = {}) => {
          if (init.method === 'PATCH') {
            return new Promise(resolve => (finish = resolve));
          }
          return jsonResponse(200, page([property({ id: 'a' })]));
        },
      );
      const tree = await renderTree(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <MyListingsScreen
            {...({
              navigation: navigation(),
              route: {},
            } as unknown as React.ComponentProps<typeof MyListingsScreen>)}
          />
        </QueryClientProvider>,
      );
      mounted.push(tree);
      await settle();

      await press(tree.root, prs.my.markSold);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.markSold)?.onPress?.();
      });
      await settle();

      const stateOf = (label: string) =>
        tree.root
          .findAll(
            node =>
              typeof node.props.onPress === 'function' &&
              node.props.accessibilityState &&
              allText(node).trim() === label,
          )
          .map(node => node.props.accessibilityState)[0];
      // The tapped one shows it is working; its neighbours wait.
      expect(stateOf(prs.my.archive)).toMatchObject({ disabled: true });
      expect(stateOf(prs.my.edit)).toMatchObject({ disabled: true });
      expect(stateOf(prs.common.delete)).toMatchObject({ disabled: true });
      expect(stateOf(prs.my.promote)).toMatchObject({ disabled: true });

      await ReactTestRenderer.act(async () => {
        finish(jsonResponse(200, property({ id: 'a', status: 'SOLD' })));
      });
      await settle();
    });
  });

  describe('the summary at the top', () => {
    const sale = (overrides: Partial<Property>) =>
      property({ deal_type: 'SALE', ...overrides });

    it('adds up the sale listings per currency, for the live ones and for the closed deals', async () => {
      const { tree } = await mine([
        sale({ id: 'a', price: 1000000 }),
        sale({ id: 'b', price: 250000 }),
        sale({ id: 'c', price: 90000, currency: 'USD' }),
        sale({ id: 'd', price: 3000000, status: 'SOLD' }),
      ]);
      const active = allText(
        tree.root.findAll(node => node.props.testID === 'summary-active')[0],
      );
      const sold = allText(
        tree.root.findAll(node => node.props.testID === 'summary-sold')[0],
      );
      expect(active).toContain(formatCurrency(1250000, 'AFGHANI'));
      expect(active).toContain(formatCurrency(90000, 'USD'));
      expect(sold).toContain(formatCurrency(3000000, 'AFGHANI'));
      expect(allText(tree.root)).toContain(prs.my.valueNote);
    });

    it('does not add rents and pledges to the sums, and never mixes currencies', async () => {
      const { tree } = await mine([
        sale({ id: 'a', price: 1000000 }),
        property({ id: 'b', price: 7000, deal_type: 'RENT' }),
        property({ id: 'c', price: 500000, deal_type: 'MORTGAGE_GROWI' }),
        sale({ id: 'd', price: 5000, currency: 'USD' }),
      ]);
      const active = allText(
        tree.root.findAll(node => node.props.testID === 'summary-active')[0],
      );
      expect(active).toContain(formatCurrency(1000000, 'AFGHANI'));
      expect(active).toContain(formatCurrency(5000, 'USD'));
      expect(active).not.toContain(formatCurrency(1507000, 'AFGHANI'));
      expect(active).not.toContain(formatCurrency(7000, 'AFGHANI'));
    });

    it('says how many listings are live and how many are closed', async () => {
      const { tree } = await mine([
        sale({ id: 'a' }),
        sale({ id: 'b' }),
        sale({ id: 'c', status: 'SOLD' }),
      ]);
      const count = (testID: string) =>
        allText(tree.root.findAll(node => node.props.testID === testID)[0]);
      expect(count('summary-active')).toContain(
        prs.my.count.replace('{{count}}', formatNumber(2, 0)),
      );
      expect(count('summary-sold')).toContain(
        prs.my.count.replace('{{count}}', formatNumber(1, 0)),
      );
    });
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
