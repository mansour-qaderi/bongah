import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { MAP_ATTRIBUTION_URL } from '../src/config';
import {
  allText,
  mockApi,
  pressableWith,
  render as renderTree,
} from '../test-utils';

const fetchMock = jest.fn();
let mockAuth: Record<string, unknown> = {};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the screen picks it up.
import AccountScreen from '../src/screens/account/AccountScreen';

const user = {
  id: 'u1',
  role: 'USER',
  phone_number: '+93701234567',
  full_name: 'احمد',
  avatar: null,
};
const agency = { ...user, id: 'a1', role: 'AGENCY' };

const dashboard = (subscription: Record<string, unknown>) => ({
  agency: { id: 'a1', agency_name: 'دفتر آریانا', is_verified: true },
  stats: {
    total_properties: 1,
    active_listings: 1,
    featured_listings: 0,
    total_views: 3,
  },
  subscription,
  top_listings: [],
});

const navigation = () => ({ navigate: jest.fn(), goBack: jest.fn() });
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

const mount = async (nav = navigation()) => {
  const tree = await renderTree(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AccountScreen
        {...({ navigation: nav, route: {} } as unknown as React.ComponentProps<
          typeof AccountScreen
        >)}
      />
    </QueryClientProvider>,
  );
  mounted.push(tree);
  // Let the dashboard query settle.
  for (let i = 0; i < 4; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
  return { tree, nav };
};
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  ReactTestRenderer.act(async () => {
    pressableWith(root, label).props.onPress();
  });

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user, signOut: jest.fn() };
});
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

describe('AccountScreen dashboard', () => {
  it('shows the profile card: name, phone with its digits in Persian, and the account type', async () => {
    const { tree } = await mount();
    const text = allText(tree.root);
    expect(text).toContain('احمد');
    expect(text).toContain(prs.role.USER);
    expect(text).toContain(prs.account.settings);
    expect(text).toContain(prs.account.morningMessages);
    expect(text).toContain(prs.account.language);
    expect(text).toContain(prs.account.invite);
    // The phone is a number: Persian digits, never Western ones, outside the map credit.
    const withoutCredit = text.split(prs.home.mapCredits)[0];
    expect(withoutCredit).not.toMatch(/[0-9]/);
  });

  it('gives an ordinary user no agency tools and no plan badge', async () => {
    const { tree } = await mount();
    const text = allText(tree.root);
    expect(text).not.toContain(prs.account.agencyTools);
    expect(text).not.toContain(prs.account.noSubscription);
  });

  it('shows an office its running plan and the days left, in Persian digits', async () => {
    mockAuth = { status: 'signedIn', user: agency, signOut: jest.fn() };
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': {
        body: dashboard({
          is_active: true,
          package_type: 'MONTHLY',
          ends_at: '2026-11-10T00:00:00Z',
          remaining_days: 28,
        }),
      },
    });
    const { tree } = await mount();
    const text = allText(tree.root);
    expect(text).toContain(prs.role.AGENCY);
    expect(text).toContain(
      prs.account.subscriptionLeft
        .replace('{{plan}}', prs.package.MONTHLY)
        .replace('{{count}}', formatNumber(28, 0)),
    );
  });

  it('tells an office without a plan so', async () => {
    mockAuth = { status: 'signedIn', user: agency, signOut: jest.fn() };
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': {
        body: dashboard({
          is_active: false,
          package_type: null,
          ends_at: null,
          remaining_days: 0,
        }),
      },
    });
    const { tree } = await mount();
    expect(allText(tree.root)).toContain(prs.account.noSubscription);
  });

  it('gives an office its dashboard and templates', async () => {
    mockAuth = { status: 'signedIn', user: agency, signOut: jest.fn() };
    mockApi(fetchMock, {
      'GET /agencies/me/dashboard': {
        body: dashboard({
          is_active: false,
          package_type: null,
          ends_at: null,
          remaining_days: 0,
        }),
      },
    });
    const { tree, nav } = await mount();
    expect(allText(tree.root)).toContain(prs.account.agencyTools);
    await press(tree.root, prs.nav.dashboard);
    expect(nav.navigate).toHaveBeenCalledWith('Dashboard');
    await press(tree.root, prs.nav.templates);
    expect(nav.navigate).toHaveBeenCalledWith('Templates');
  });

  it('opens the referral screen from the invite card', async () => {
    const { tree, nav } = await mount();
    await press(tree.root, prs.account.invite);
    expect(nav.navigate).toHaveBeenCalledWith('Referral');
  });

  it('invites a signed-out visitor to sign in, and hides what needs an account', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree, nav } = await mount();
    const text = allText(tree.root);
    expect(text).toContain(prs.welcome.title);
    expect(text).toContain(prs.account.guestHint);
    expect(text).not.toContain(prs.account.invite);
    expect(text).not.toContain(prs.account.morningMessages);
    expect(text).not.toContain(prs.auth.signOut);
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });

  it('opens the OpenStreetMap credit', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { tree } = await mount();
    await press(tree.root, prs.home.mapCredits);
    expect(open).toHaveBeenCalledWith(MAP_ATTRIBUTION_URL);
    open.mockRestore();
  });
});
