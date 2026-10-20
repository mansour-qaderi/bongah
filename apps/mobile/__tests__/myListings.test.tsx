import React from 'react';
import { Alert, Share } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Property } from '@bongah/shared-types';
import { queryClient } from '../src/api/hooks';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { captureToasts } from '../test-utils/toasts';
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
let toasts: ReturnType<typeof captureToasts>;
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screens pick it up.
import Badge from '../src/components/Badge';
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
  toasts = captureToasts();
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
  toasts.restore();
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
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
/** Lets a bottom sheet finish sliding (its close animation is 200 ms) and whatever it then runs. */
const slide = async () => {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 450));
  });
};
/** Taps the "more" button of the `index`-th card. */
const pressMore = async (
  root: ReactTestRenderer.ReactTestInstance,
  index = 0,
) => {
  const buttons = root.findAll(
    node =>
      node.props.testID === 'listing-more' &&
      typeof node.props.onPress === 'function',
  );
  const handlers = [...new Set(buttons.map(node => node.props.onPress))];
  await ReactTestRenderer.act(async () => {
    handlers[index]();
  });
  await settle();
};
/** Opens a card's menu, picks `label` in it and waits for the sheet to go, which is when the action runs. */
const choose = async (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
  index = 0,
) => {
  await pressMore(root, index);
  await press(root, label);
  await slide();
};

describe('ListingCard', () => {
  const card = async (p: Property, actions = [] as never[]) => {
    const onPress = jest.fn();
    const tree = await renderTree(
      <ListingCard property={p} onPress={onPress} actions={actions} />,
    );
    mounted.push(tree);
    return { tree, onPress };
  };

  it('shows the title, the price with ؋ in Persian digits, the status and the deal tag', async () => {
    const { tree } = await card(property());
    const text = allText(tree.root);
    expect(text).toContain('خانه حویلی در شهر نو');
    expect(text).toContain('؋');
    expect(text).toContain('۵,۲۰۰,۰۰۰');
    expect(text).toContain(prs.dealType.SALE);
    expect(text).toContain(prs.status.ACTIVE);
    expect(text).not.toMatch(/[0-9]/);
  });

  it('says the kind once, in the facts grid, and shows the picture when there is one', async () => {
    const { tree } = await card(
      property({ images: ['https://img.example/a.jpg'] }),
    );
    expect(allText(tree.root)).toContain(prs.propertyType.HOUSE_HAWILI);
    // The tag row holds the deal only (no "featured" badge on a plain listing).
    const row = tree.root.findAll(
      node => node.props.testID === 'listing-badges',
    )[0];
    expect(allText(row)).not.toContain(prs.property.featured);
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

  it('keeps the rest behind a "more" button, and opens them from its sheet', async () => {
    const act = jest.fn();
    const tree = await renderTree(
      <ListingCard
        property={property()}
        onPress={jest.fn()}
        actions={[{ label: prs.my.edit, onPress: jest.fn() }]}
        menu={[{ label: prs.my.promote, onPress: act, tone: 'brand' }]}
      />,
    );
    mounted.push(tree);
    // Closed: the menu's labels are not on the card.
    expect(allText(tree.root)).not.toContain(prs.my.promote);
    await pressMore(tree.root);
    expect(allText(tree.root)).toContain(prs.my.promote);
    await press(tree.root, prs.my.promote);
    // It runs once the sheet has slid away, not before.
    expect(act).not.toHaveBeenCalled();
    await slide();
    expect(act).toHaveBeenCalledTimes(1);
    expect(allText(tree.root)).not.toContain(prs.my.promote);
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

  it('lists every listing, with the count above them and no summary block', async () => {
    const { tree } = await mine(LIST);
    const text = allText(tree.root);
    for (const title of ['آگهی فعال', 'آگهی فروخته', 'آگهی بایگانی']) {
      expect(text).toContain(title);
    }
    expect(text).toContain(
      prs.my.count.replace('{{count}}', formatNumber(3, 0)),
    );
    expect(
      tree.root.findAll(node =>
        String(node.props.testID ?? '').startsWith('summary-'),
      ),
    ).toHaveLength(0);
  });

  describe('the status tabs', () => {
    const tab = (status: 'ALL' | 'ACTIVE' | 'SOLD' | 'ARCHIVED', n: number) =>
      `${
        status === 'ALL' ? prs.my.filterAll : prs.status[status]
      } ${formatNumber(n, 0)}`;
    const titles = (root: ReactTestRenderer.ReactTestInstance) => {
      const text = allText(root);
      return ['آگهی فعال', 'آگهی فروخته', 'آگهی بایگانی'].filter(title =>
        text.includes(title),
      );
    };

    it('shows همه, فعال, معامله شد and غیرفعال, each with how many listings it holds', async () => {
      const { tree } = await mine(LIST);
      expect(prs.my.filterAll).toBe('همه');
      for (const [status, n] of [
        ['ALL', 3],
        ['ACTIVE', 1],
        ['SOLD', 1],
        ['ARCHIVED', 1],
      ] as const) {
        expect(buttonCount(tree.root, tab(status, n))).toBe(1);
      }
    });

    it('narrows the list to one status when its tab is tapped, and back to all', async () => {
      const { tree } = await mine(LIST);
      await press(tree.root, tab('SOLD', 1));
      expect(titles(tree.root)).toEqual(['آگهی فروخته']);
      await press(tree.root, tab('ARCHIVED', 1));
      expect(titles(tree.root)).toEqual(['آگهی بایگانی']);
      await press(tree.root, tab('ACTIVE', 1));
      expect(titles(tree.root)).toEqual(['آگهی فعال']);
      await press(tree.root, tab('ALL', 3));
      expect(titles(tree.root)).toHaveLength(3);
    });

    it('marks the chosen tab and counts the listings it shows', async () => {
      const { tree } = await mine(LIST);
      await press(tree.root, tab('SOLD', 1));
      const selected = tree.root.findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          node.props.accessibilityState?.selected === true,
      );
      expect(allText(selected[0])).toContain(prs.status.SOLD);
      expect(allText(tree.root)).toContain(
        prs.my.count.replace('{{count}}', formatNumber(1, 0)),
      );
    });

    it('says so when a tab has no listings, instead of showing the other tabs', async () => {
      const { tree } = await mine([property({ id: 'a', title: 'آگهی فعال' })]);
      await press(tree.root, tab('SOLD', 0));
      expect(titles(tree.root)).toEqual([]);
      expect(allText(tree.root)).toContain(prs.my.emptyFilter);
      // The tabs stay, so the owner can go back.
      await press(tree.root, tab('ALL', 1));
      expect(titles(tree.root)).toEqual(['آگهی فعال']);
    });
  });

  it('floats a "new listing" button over the list', async () => {
    const { tree, nav } = await mine(LIST);
    await press(tree.root, prs.my.newListing);
    expect(nav.navigate).toHaveBeenCalledWith('AddProperty');
  });

  it('puts Edit and Share on every card, and the rest behind "more"', async () => {
    const { tree } = await mine(LIST);
    expect(buttonCount(tree.root, prs.my.edit)).toBe(3);
    expect(buttonCount(tree.root, prs.property.share)).toBe(3);
    expect(
      tree.root.findAll(
        node =>
          node.props.testID === 'listing-more' &&
          typeof node.props.onPress === 'function',
      ).length,
    ).toBeGreaterThan(0);
    // Nothing else is on the cards until a menu is opened.
    for (const label of [
      prs.my.promote,
      prs.my.markSold,
      prs.my.archive,
      prs.my.activate,
      prs.common.delete,
    ]) {
      expect(buttonCount(tree.root, label)).toBe(0);
    }
  });

  const menuLabels = async (
    root: ReactTestRenderer.ReactTestInstance,
    index = 0,
  ) => {
    await pressMore(root, index);
    const menu = root.findAll(node => node.props.testID === 'action-menu')[0];
    const labels = menu
      .findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          node.props.accessibilityRole === 'button',
      )
      .map(node => allText(node).trim());
    return labels;
  };

  it('offers promote, traded, switch off and delete in the menu of a live listing', async () => {
    const { tree } = await mine([property({ id: 'a' })]);
    expect(await menuLabels(tree.root)).toEqual([
      prs.my.promote,
      prs.my.markSold,
      prs.my.archive,
      prs.common.delete,
    ]);
  });

  it('offers switch on and delete (no promote, no traded) in the menu of a traded or switched-off listing', async () => {
    for (const status of ['SOLD', 'ARCHIVED'] as const) {
      const { tree } = await mine([property({ id: 'b', status })]);
      expect(await menuLabels(tree.root)).toEqual([
        prs.my.activate,
        prs.common.delete,
      ]);
    }
  });

  it("shows each listing's status as a badge, with the words the owner knows", async () => {
    const { tree } = await mine(LIST);
    expect(prs.status).toEqual({
      ACTIVE: 'فعال',
      SOLD: 'معامله شد',
      ARCHIVED: 'غیرفعال',
    });
    const badges = tree.root.findAll(
      node => node.props.testID === 'listing-status',
    );
    const words = badges.map(badge => allText(badge));
    expect(words.some(text => text.includes(prs.status.ACTIVE))).toBe(true);
    expect(words.some(text => text.includes(prs.status.SOLD))).toBe(true);
    expect(words.some(text => text.includes(prs.status.ARCHIVED))).toBe(true);
  });

  it('puts a line icon beside each action: a pencil for Edit and the share glyph for Share', async () => {
    const { tree } = await mine([property({ id: 'a' })]);
    const iconOf = (label: string) =>
      tree.root
        .findAll(
          node =>
            typeof node.props.onPress === 'function' &&
            allText(node).trim() === label,
        )
        .flatMap(node =>
          node.findAll(inner => typeof inner.props.name === 'string'),
        )
        .map(inner => inner.props.name)[0];
    expect(iconOf(prs.my.edit)).toBe('edit');
    expect(iconOf(prs.property.share)).toBe('share');
  });

  it('puts an icon on every menu row: a tick for "معامله شد", an arrow for promote, a bin for delete', async () => {
    const { tree } = await mine([property({ id: 'a' })]);
    await pressMore(tree.root);
    const menu = tree.root.findAll(
      node => node.props.testID === 'action-menu',
    )[0];
    const rows = menu.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityRole === 'button',
    );
    const icons = Object.fromEntries(
      rows.map(row => [
        allText(row).trim(),
        row.findAll(inner => typeof inner.props.name === 'string')[0]?.props
          .name,
      ]),
    );
    expect(icons).toEqual({
      [prs.my.promote]: 'arrowUp',
      [prs.my.markSold]: 'check',
      [prs.my.archive]: 'toggleOff',
      [prs.common.delete]: 'trash',
    });
  });

  it('puts the switch-on icon on the menu row that brings a listing back', async () => {
    const { tree } = await mine([property({ id: 'c', status: 'ARCHIVED' })]);
    await pressMore(tree.root);
    const menu = tree.root.findAll(
      node => node.props.testID === 'action-menu',
    )[0];
    expect(
      menu.findAll(node => node.props.name === 'toggleOn').length,
    ).toBeGreaterThan(0);
  });

  it("shows each card's own deal tag, and only that one", async () => {
    const { tree } = await mine(
      ['SALE', 'RENT', 'MORTGAGE_GROWI'].map(deal_type =>
        property({
          id: deal_type,
          deal_type: deal_type as Property['deal_type'],
        }),
      ),
    );
    for (const deal of ['SALE', 'RENT', 'MORTGAGE_GROWI'] as const) {
      const badges = tree.root
        .findAllByType(Badge)
        .filter(badge => badge.props.label === prs.dealType[deal]);
      expect(badges).toHaveLength(1);
      // a plain tag: no dot
      expect(badges[0].props.dot).toBe(false);
    }
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
      await choose(tree.root, prs.my.markSold);
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
      await choose(tree.root, prs.my.archive);
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
      await choose(tree.root, prs.my.activate);
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
      // Two live listings: use the first one's menu.
      await choose(tree.root, prs.common.delete, 0);
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
      await choose(tree.root, prs.common.delete);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.common.delete)?.onPress?.();
      });
      await settle();
      expect(allText(tree.root)).toContain('آگهی اول');
      expect(toasts.messages).toHaveLength(1);
      expect(await kv.get(KV_KEYS.deletedListings)).toBeNull();
    });

    it('shows the error and leaves the status alone when a change fails', async () => {
      const { tree } = await mine([property({ id: 'a' })], navigation(), {
        'PATCH /properties/a': { status: 500, body: { message: 'boom' } },
      });
      await choose(tree.root, prs.my.markSold);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.markSold)?.onPress?.();
      });
      await settle();
      expect(toasts.messages).toHaveLength(1);
      // Still a live listing: its menu still has the live-only actions.
      expect(await menuLabels(tree.root)).toContain(prs.my.markSold);
    });

    it("holds a listing's buttons while one change is running, so two cannot race", async () => {
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

      await choose(tree.root, prs.my.markSold);
      await ReactTestRenderer.act(async () => {
        alertButton(alert, prs.my.markSold)?.onPress?.();
      });
      await settle();

      const stateOf = (
        match: (node: ReactTestRenderer.ReactTestInstance) => boolean,
      ) =>
        tree.root
          .findAll(
            node =>
              typeof node.props.onPress === 'function' &&
              node.props.accessibilityState &&
              match(node),
          )
          .map(node => node.props.accessibilityState)[0];
      // The "more" button shows it is working; Edit and Share wait.
      expect(
        stateOf(node => node.props.testID === 'listing-more'),
      ).toMatchObject({ busy: true, disabled: true });
      expect(
        stateOf(node => allText(node).trim() === prs.my.edit),
      ).toMatchObject({ disabled: true });
      expect(
        stateOf(node => allText(node).trim() === prs.property.share),
      ).toMatchObject({ disabled: true });

      await ReactTestRenderer.act(async () => {
        finish(jsonResponse(200, property({ id: 'a', status: 'SOLD' })));
      });
      await settle();
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

  it("shares the listing from its card through the phone's share sheet", async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const { tree, nav } = await mine([property({ id: 'a' })]);
    await press(tree.root, prs.property.share);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].message).toContain('/listing/a');
    expect(nav.navigate).not.toHaveBeenCalled();
    share.mockRestore();
  });

  it('opens the promotion sheet from the menu', async () => {
    const { tree } = await mine([property({ id: 'a' })]);
    await choose(tree.root, prs.my.promote);
    expect(allText(tree.root)).toContain(prs.promotion.title);
  });

  it('asks before archiving', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree } = await mine([property({ id: 'a' })]);
    await choose(tree.root, prs.my.archive);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toBe(prs.my.archiveConfirm);
    alert.mockRestore();
  });
});
