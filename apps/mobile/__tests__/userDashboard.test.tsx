import React from 'react';
import { Linking, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { resetSavedForTests, toggleSaved } from '../src/favorites/store';
import {
  markDeleted,
  resetDeletedForTests,
  useDeletedListings,
} from '../src/listings/deleted';
import { linking } from '../src/navigation/linking';
import { referralLink } from '../src/share/referralLink';
import { KV_KEYS, kv } from '../src/storage/kv';
import { allText, mockApi, render as renderTree } from '../test-utils';

const fetchMock = jest.fn();

// Imported after the mocks so the screen picks them up.
import PropertyCard from '../src/components/PropertyCard';
import SavedListingsScreen from '../src/screens/saved/SavedListingsScreen';

const act = ReactTestRenderer.act;
const idA = '11111111-1111-4111-8111-111111111111';

const property = (overrides: Partial<Property> = {}): Property => ({
  id: idA,
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'خانه سه خوابه در شهر نو',
  description: '',
  type: 'HOUSE_HAWILI',
  unit: null,
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
/** Renders and lets timers run inside the same act, for components that read storage as they mount. */
const showSettled = async (element: React.ReactElement) => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element);
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
  mounted.push(tree);
  return tree;
};
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  await kv.remove(KV_KEYS.favorites);
  await kv.remove(KV_KEYS.deletedListings);
  resetSavedForTests();
  resetDeletedForTests();
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

describe('Saved listings', () => {
  const screen = (nav = { navigate: jest.fn() }) => (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SavedListingsScreen
        {...({ navigation: nav, route: {} } as unknown as React.ComponentProps<
          typeof SavedListingsScreen
        >)}
      />
    </QueryClientProvider>
  );

  it('with nothing saved, draws a picture and says "هیچ آگهی نشان نشده است"', async () => {
    const tree = await show(screen());
    await settle();
    expect(prs.saved.empty).toBe('هیچ آگهی نشان نشده است');
    expect(allText(tree.root)).toContain('هیچ آگهی نشان نشده است');
    expect(
      tree.root.findAll(node => node.props.testID === 'empty-illustration'),
    ).not.toHaveLength(0);
    // And there is a way out of the empty page.
    expect(allText(tree.root)).toContain(prs.saved.browse);
  });

  it('has the empty message in Pashto too', () => {
    expect(ps.saved.empty.trim().length).toBeGreaterThan(0);
    expect(ps.saved.empty).not.toBe(prs.saved.empty);
  });

  it('removes a listing with one tap on its ribbon, and shows the empty page after the last one', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${idA}`]: { body: property() },
    });
    await toggleSaved(idA);
    const tree = await show(screen());
    await settle();
    expect(allText(tree.root)).toContain('خانه سه خوابه در شهر نو');
    // The currency is written the way every other card writes it.
    expect(allText(tree.root)).toContain('۱,۲۰۰,۰۰۰');

    await act(async () => {
      tree.root
        .find(
          node => node.props.testID === `bookmark-${idA}` && node.props.onPress,
        )
        .props.onPress();
    });
    await settle();
    expect(allText(tree.root)).not.toContain('خانه سه خوابه در شهر نو');
    expect(allText(tree.root)).toContain(prs.saved.empty);
  });

  it('says so on the card when a saved listing has been sold since', async () => {
    mockApi(fetchMock, {
      [`GET /properties/${idA}`]: { body: property({ status: 'SOLD' }) },
    });
    await toggleSaved(idA);
    const tree = await show(screen());
    await settle();
    expect(allText(tree.root)).toContain(prs.status.SOLD);
  });

  it('does not add that badge to a live listing', async () => {
    const tree = await show(
      <PropertyCard property={property()} onPress={jest.fn()} />,
    );
    expect(allText(tree.root)).not.toContain(prs.status.SOLD);
  });
});

describe('Deleted listings (this phone)', () => {
  const Probe = () => <Text>{useDeletedListings().join(',')}</Text>;

  it('remembers an id, once, and keeps it across a restart', async () => {
    await markDeleted('a');
    await markDeleted('a');
    await markDeleted('b');
    expect(await kv.get(KV_KEYS.deletedListings)).toBe(
      JSON.stringify(['a', 'b']),
    );
    // A restart: memory is empty, the stored value is read again.
    resetDeletedForTests();
    const tree = await showSettled(<Probe />);
    expect(allText(tree.root)).toBe('a,b');
  });

  it('treats a damaged stored value as nothing deleted', async () => {
    await kv.set(KV_KEYS.deletedListings, '{not json');
    const tree = await showSettled(<Probe />);
    expect(allText(tree.root)).toBe('');
    await kv.set(KV_KEYS.deletedListings, JSON.stringify({ a: 1 }));
    await act(async () => {
      resetDeletedForTests();
    });
    const again = await showSettled(<Probe />);
    expect(allText(again.root)).toBe('');
  });
});

describe('The invite link', () => {
  it("is the server's link when there is one, and built from the code when there is not", () => {
    expect(
      referralLink({
        referral_code: 'ABCD2345',
        share_url: 'https://x.example/i/ABCD2345',
      }),
    ).toBe('https://x.example/i/ABCD2345');
    expect(referralLink({ referral_code: 'ABCD2345', share_url: null })).toBe(
      'https://bongah.app/invite/ABCD2345',
    );
  });
});

describe('Opening the app from a shared listing link', () => {
  const Stack = createNativeStackNavigator();
  const Page = ({
    route,
  }: {
    route: { name: string; params?: { id?: string } };
  }) => <Text>{`${route.name}:${route.params?.id ?? ''}`}</Text>;

  const start = async (initialUrl: string | null) => {
    let onUrl: ((event: { url: string }) => void) | undefined;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(initialUrl);
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _type: string,
      handler: typeof onUrl,
    ) => {
      onUrl = handler;
      return { remove: jest.fn() };
    }) as never);
    const ref = createNavigationContainerRef();
    const tree = await show(
      <NavigationContainer ref={ref} linking={linking}>
        <Stack.Navigator initialRouteName="Splash">
          <Stack.Screen name="Splash" component={Page as never} />
          <Stack.Screen name="Tabs" component={Page as never} />
          <Stack.Screen name="PropertyDetails" component={Page as never} />
        </Stack.Navigator>
      </NavigationContainer>,
    );
    await settle();
    const routes = () =>
      (ref.getRootState()?.routes ?? []).map(route => ({
        name: route.name,
        id: (route.params as { id?: string } | undefined)?.id,
      }));
    return { tree, routes, open: (url: string) => onUrl?.({ url }) };
  };

  it('opens the listing from the web address, with the map screen under it', async () => {
    const { routes } = await start('https://bongah.app/listing/abc-1');
    expect(routes()).toEqual([
      { name: 'Tabs', id: undefined },
      { name: 'PropertyDetails', id: 'abc-1' },
    ]);
  });

  it("opens the listing from the app's own address", async () => {
    const { routes } = await start('bongah://listing/abc-2');
    expect(routes()).toEqual([
      { name: 'Tabs', id: undefined },
      { name: 'PropertyDetails', id: 'abc-2' },
    ]);
  });

  it('reads an id with special characters back exactly', async () => {
    const { routes } = await start('bongah://listing/a%20b');
    expect(routes().at(-1)).toEqual({ name: 'PropertyDetails', id: 'a b' });
  });

  it('opens the listing when a link arrives while the app is already open', async () => {
    const { routes, open } = await start(null);
    expect(routes()).toEqual([{ name: 'Splash', id: undefined }]);
    await act(async () => {
      open('https://bongah.app/listing/xyz-9');
    });
    await settle();
    expect(routes().at(-1)).toEqual({ name: 'PropertyDetails', id: 'xyz-9' });
  });

  it('starts as usual for a link that is not a listing link', async () => {
    for (const url of [
      'https://bongah.app/invite/ABCD2345',
      'https://bongah.app/listing/',
      'bongah://chat/5',
      'https://example.com/listing/abc',
    ]) {
      const { routes } = await start(url);
      expect(routes()).toEqual([{ name: 'Splash', id: undefined }]);
      await act(async () => {
        mounted.splice(0).forEach(tree => tree.unmount());
      });
    }
  });

  it('ignores a listing link that arrives while the app is open if it is not a listing link', async () => {
    const { routes, open } = await start(null);
    await act(async () => {
      open('https://bongah.app/somewhere/else');
    });
    await settle();
    expect(routes()).toEqual([{ name: 'Splash', id: undefined }]);
  });

  it('accepts the web addresses with www, and the app, and nothing else, as prefixes', () => {
    expect(linking.prefixes).toEqual([
      'bongah://',
      'https://bongah.app',
      'https://www.bongah.app',
    ]);
  });
});
