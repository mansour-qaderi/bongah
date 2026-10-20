import React, { useState } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, Switch } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@bongah/shared-types';
import { changeLanguage, initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { captureToasts } from '../test-utils/toasts';
import ps from '../src/i18n/locales/ps.json';
import { KV_KEYS, kv } from '../src/storage/kv';
import { resetPushRegistration } from '../src/push/registration';
import {
  allText,
  callsTo,
  jsonResponse,
  mockApi,
  pressableWith,
  render,
} from '../test-utils';

const fetchMock = jest.fn();
let toasts: ReturnType<typeof captureToasts>;
// The Account tab also shows the invite banner, which asks for the referral summary. These tests are about the
// morning-messages switch, so that request is left out of what they count.
const switchCalls = () =>
  callsTo(fetchMock).filter(
    call => call.path !== '/referrals/me' && call.path !== '/wallet',
  );

// A signed-in session whose user can be replaced, like the real AuthProvider's.
jest.mock('../src/auth/AuthContext', () => {
  const { createContext, useContext } = require('react');
  const Context = createContext(null);
  return {
    __esModule: true,
    useAuth: () => useContext(Context),
    AuthContextForTest: Context,
  };
});
// Whether the Tabs screen is in front (false while the sign-in sheet or another screen is on top of it).
jest.mock('@react-navigation/native', () => {
  const { createContext, useContext } = require('react');
  const FocusContext = createContext(true);
  return {
    ...jest.requireActual('@react-navigation/native'),
    useIsFocused: () => useContext(FocusContext),
    FocusForTest: FocusContext,
  };
});

// Imported after the mocks so they pick them up.
import AccountScreen from '../src/screens/account/AccountScreen';
import WelcomeGate from '../src/welcome/WelcomeGate';

const { FocusForTest } = jest.requireMock('@react-navigation/native') as {
  FocusForTest: React.Context<boolean>;
};
const { AuthContextForTest } = jest.requireMock('../src/auth/AuthContext') as {
  AuthContextForTest: React.Context<unknown>;
};
const messaging = jest.requireMock('@react-native-firebase/messaging') as {
  __state: { token: string; permission: number; promptAnswer: number | null };
  requestPermission: jest.Mock;
  getToken: jest.Mock;
};

const baseUser: User = {
  id: 'u1',
  phone_number: '+93701234567',
  full_name: 'احمد',
  role: 'USER',
  avatar: null,
  enable_daily_motivation: true,
  has_seen_welcome: false,
};
const QUOTE = {
  id: 'q1',
  text: 'شکرگزاری کلید یک روز آرام است',
  language: 'prs',
};
const updatedUsers: User[] = [];

function Session({
  initial,
  children,
}: {
  initial: User | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initial);
  const value = {
    status: user ? 'signedIn' : 'signedOut',
    user,
    updateUser: async (next: User) => {
      updatedUsers.push(next);
      setUser(next);
    },
    signOut: jest.fn(),
    signIn: jest.fn(),
  };
  return (
    <AuthContextForTest.Provider value={value}>
      {children}
    </AuthContextForTest.Provider>
  );
}

let setFocused: (focused: boolean) => void = () => undefined;
let startFocused = true;
function Focus({ children }: { children: React.ReactNode }) {
  const [focused, set] = useState(startFocused);
  setFocused = set;
  return <FocusForTest.Provider value={focused}>{children}</FocusForTest.Provider>;
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const mountIn = async (
  ui: React.ReactElement,
  user: User | null = baseUser,
) => {
  const tree = await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Focus>
        <Session initial={user}>{ui}</Session>
      </Focus>
    </QueryClientProvider>,
  );
  mounted.push(tree);
  await settle();
  return tree;
};
let fakeClock = false;
/**
 * Lets pending work (storage reads, fetches, state updates) run to the end. React Query hands results to React on a
 * 0 ms timer, so a few microtask turns are not enough: the clock has to move too.
 */
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await ReactTestRenderer.act(async () => {
      if (fakeClock) jest.advanceTimersByTime(10);
      await new Promise<void>(resolve =>
        fakeClock ? setImmediate(resolve) : setTimeout(resolve, 10),
      );
    });
  }
};
const press = async (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  await ReactTestRenderer.act(async () => {
    pressableWith(root, label).props.onPress();
  });
  await settle();
};
const flip = async (
  root: ReactTestRenderer.ReactTestInstance,
  value: boolean,
) => {
  await ReactTestRenderer.act(async () => {
    root.findByType(Switch).props.onValueChange(value);
  });
  await settle();
};
const cardShown = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAll(node => node.props.testID === 'welcome-card').length > 0;
const PATCH_SEEN = { method: 'PATCH', path: '/users/me/preferences', body: { has_seen_welcome: true } };

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  toasts = captureToasts();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  startFocused = true;
  updatedUsers.length = 0;
  messaging.__state.permission = 1;
  messaging.__state.promptAnswer = null;
  messaging.__state.token = 'fcm-token-1';
  messaging.requestPermission.mockClear();
  resetPushRegistration();
  await kv.remove(KV_KEYS.welcomeSeen('u1'));
  await changeLanguage('prs');
});
afterEach(async () => {
  toasts.restore();
  await ReactTestRenderer.act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  // Work started by the test (closing the card keeps saving after the screen is gone) must end before the next
  // test clears the phone's storage, or it would write into that test.
  await settle();
  jest.restoreAllMocks();
  jest.useRealTimers();
  fakeClock = false;
});

describe('the first-time welcome card', () => {
  const routes = (extra: Record<string, never> = {}) => ({
    'GET /quotes/welcome': { body: QUOTE },
    'PATCH /users/me/preferences': (init: RequestInit) => ({
      body: { ...baseUser, ...JSON.parse(String(init.body)) },
    }),
    'PUT /notifications/devices': { status: 204 },
    ...extra,
  });

  it('opens with the admin\'s quote for a new account, asking for it in the app language', async () => {
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);

    expect(cardShown(tree.root)).toBe(true);
    const text = allText(tree.root);
    expect(text).toContain(prs.welcome.title);
    expect(text).toContain(prs.welcome.thanks);
    expect(text).toContain(QUOTE.text);
    expect(callsTo(fetchMock).find(c => c.path === '/quotes/welcome')?.query).toEqual({ language: 'prs' });
    // Nothing is recorded or asked just by looking at it.
    expect(callsTo(fetchMock).filter(c => c.method !== 'GET')).toEqual([]);
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });

  it('asks for the Pashto quote when the app is in Pashto, and shows Pashto words', async () => {
    await changeLanguage('ps');
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    expect(callsTo(fetchMock).find(c => c.path === '/quotes/welcome')?.query).toEqual({ language: 'ps' });
    expect(allText(tree.root)).toContain(ps.welcome.title);
  });

  it('uses the built-in text when the admin has not written a welcome quote', async () => {
    mockApi(fetchMock, routes({ 'GET /quotes/welcome': { status: 404, body: { code: 'NO_ACTIVE_QUOTE' } } as never }));
    const tree = await mountIn(<WelcomeGate />);
    expect(cardShown(tree.root)).toBe(true);
    expect(allText(tree.root)).toContain(prs.welcome.fallbackQuote);
  });

  it('does not keep the person waiting for a slow quote: after a moment it opens with the built-in text, and keeps it', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fakeClock = true;
    let answer!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () => new Promise(resolve => (answer = resolve)),
    );
    const tree = await mountIn(<WelcomeGate />);
    expect(cardShown(tree.root)).toBe(false);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await settle();
    expect(allText(tree.root)).toContain(prs.welcome.fallbackQuote);

    // The quote turning up late does not change the words under the reader.
    await ReactTestRenderer.act(async () => {
      answer(jsonResponse(200, QUOTE));
    });
    await settle();
    expect(allText(tree.root)).toContain(prs.welcome.fallbackQuote);
    expect(allText(tree.root)).not.toContain(QUOTE.text);
  });

  it('close: records that it was seen (server and this phone), updates the user, and asks for nothing', async () => {
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    await press(tree.root, prs.common.close);

    expect(cardShown(tree.root)).toBe(false);
    expect(callsTo(fetchMock).filter(c => c.method !== 'GET')).toEqual([
      { ...PATCH_SEEN, query: {} },
    ]);
    expect(updatedUsers.at(-1)?.has_seen_welcome).toBe(true);
    expect(await kv.get(KV_KEYS.welcomeSeen('u1'))).toBe('1');
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });

  it('start: records it, closes, then asks to allow notifications and registers this phone', async () => {
    messaging.__state.permission = -1;
    messaging.__state.promptAnswer = 1;
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    await press(tree.root, prs.welcome.start);

    expect(cardShown(tree.root)).toBe(false);
    expect(messaging.requestPermission).toHaveBeenCalledTimes(1);
    const writes = callsTo(fetchMock).filter(c => c.method !== 'GET');
    expect(writes.map(c => `${c.method} ${c.path}`)).toEqual([
      'PATCH /users/me/preferences',
      'PUT /notifications/devices',
    ]);
    expect(writes[1].body).toEqual({ token: 'fcm-token-1', platform: 'IOS', language: 'prs' });
  });

  it('start does not ask for notifications from someone who has switched the morning messages off', async () => {
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />, { ...baseUser, enable_daily_motivation: false });
    await press(tree.root, prs.welcome.start);
    expect(messaging.requestPermission).not.toHaveBeenCalled();
    expect(callsTo(fetchMock).filter(c => c.path === '/notifications/devices')).toEqual([]);
    expect(callsTo(fetchMock).some(c => c.method === 'PATCH')).toBe(true);
  });

  it('still saves "seen" when the person refuses the notification prompt', async () => {
    messaging.__state.permission = -1;
    messaging.__state.promptAnswer = 0;
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    await press(tree.root, prs.welcome.start);
    expect(messaging.requestPermission).toHaveBeenCalled();
    expect(callsTo(fetchMock).some(c => c.method === 'PATCH')).toBe(true);
    expect(callsTo(fetchMock).filter(c => c.path === '/notifications/devices')).toEqual([]);
  });

  it('closes for good even when the server cannot be reached, and sends the flag on a later launch', async () => {
    mockApi(fetchMock, routes({ 'PATCH /users/me/preferences': { status: 500, body: {} } as never }));
    const tree = await mountIn(<WelcomeGate />);
    await press(tree.root, prs.common.close);
    expect(cardShown(tree.root)).toBe(false);
    expect(await kv.get(KV_KEYS.welcomeSeen('u1'))).toBe('1');

    // Next launch: the server still says "not seen", but this phone knows better and does not show it again.
    fetchMock.mockReset();
    mockApi(fetchMock, routes());
    const again = await mountIn(<WelcomeGate />);
    expect(cardShown(again.root)).toBe(false);
    expect(callsTo(fetchMock).filter(c => c.method === 'PATCH')).toEqual([
      { ...PATCH_SEEN, query: {} },
    ]);
    expect(callsTo(fetchMock).some(c => c.path === '/quotes/welcome')).toBe(false);
    expect(updatedUsers.at(-1)?.has_seen_welcome).toBe(true);
  });

  it.each([
    ['already seen', { ...baseUser, has_seen_welcome: true }],
    // A session saved by an older version of the app has no such field: that must never show a "welcome".
    ['unknown (older saved session)', (({ has_seen_welcome: _ignored, ...rest }) => rest)(baseUser) as unknown as User],
    ['signed out', null],
  ])('does not appear when the account is %s', async (_name, user) => {
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />, user);
    expect(cardShown(tree.root)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('waits while another screen (the sign-in sheet, say) is on top, then appears when it is gone', async () => {
    startFocused = false;
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    expect(cardShown(tree.root)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => setFocused(true));
    await settle();
    expect(cardShown(tree.root)).toBe(true);
    expect(allText(tree.root)).toContain(QUOTE.text);

    // And it steps aside again if something else comes to the front before the person has answered.
    await ReactTestRenderer.act(async () => setFocused(false));
    await settle();
    expect(cardShown(tree.root)).toBe(false);
  });

  it('closes with the Android back button without asking for anything', async () => {
    mockApi(fetchMock, routes());
    const tree = await mountIn(<WelcomeGate />);
    const modal = tree.root.findAll(node => typeof node.props.onRequestClose === 'function')[0];
    await ReactTestRenderer.act(async () => {
      modal.props.onRequestClose();
    });
    await settle();
    expect(cardShown(tree.root)).toBe(false);
    expect(callsTo(fetchMock).some(c => c.method === 'PATCH')).toBe(true);
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });
});

describe('the morning messages switch (Account screen)', () => {
  const nav = { navigate: jest.fn() };
  const screen = () => (
    <AccountScreen
      {...({ navigation: nav, route: {} } as unknown as React.ComponentProps<
        typeof AccountScreen
      >)}
    />
  );
  const patch = (init: RequestInit) => ({
    body: { ...baseUser, has_seen_welcome: true, ...JSON.parse(String(init.body)) },
  });

  it('is labelled "پیام‌های انرژی‌بخش صبحگاهی" and is on by default', async () => {
    const tree = await mountIn(screen());
    expect(allText(tree.root)).toContain('پیام‌های انرژی‌بخش صبحگاهی');
    expect(prs.account.morningMessages).toBe('پیام‌های انرژی‌بخش صبحگاهی');
    expect(tree.root.findByType(Switch).props.value).toBe(true);
  });

  it('shows "on" for a saved session from before the setting existed, and "off" when the user chose off', async () => {
    const old = (({ enable_daily_motivation: _ignored, ...rest }) => rest)(baseUser) as unknown as User;
    expect((await mountIn(screen(), old)).root.findByType(Switch).props.value).toBe(true);
    const off = await mountIn(screen(), { ...baseUser, enable_daily_motivation: false });
    expect(off.root.findByType(Switch).props.value).toBe(false);
  });

  it('is not offered to a signed-out visitor', async () => {
    const tree = await mountIn(screen(), null);
    expect(allText(tree.root)).not.toContain(prs.account.morningMessages);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
  });

  it('turning it off saves the choice and does not touch notification permission or the phone registration', async () => {
    mockApi(fetchMock, { 'PATCH /users/me/preferences': patch });
    const tree = await mountIn(screen());
    await flip(tree.root, false);

    expect(switchCalls()).toEqual([
      { method: 'PATCH', path: '/users/me/preferences', query: {}, body: { enable_daily_motivation: false } },
    ]);
    expect(tree.root.findByType(Switch).props.value).toBe(false);
    expect(updatedUsers.at(-1)?.enable_daily_motivation).toBe(false);
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });

  it('turning it on saves the choice, asks to allow notifications, and registers the phone', async () => {
    messaging.__state.permission = -1;
    messaging.__state.promptAnswer = 1;
    mockApi(fetchMock, {
      'PATCH /users/me/preferences': patch,
      'PUT /notifications/devices': { status: 204 },
    });
    const tree = await mountIn(screen(), { ...baseUser, enable_daily_motivation: false, has_seen_welcome: true });
    await flip(tree.root, true);

    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(messaging.requestPermission).toHaveBeenCalledTimes(1);
    expect(switchCalls().map(c => `${c.method} ${c.path}`)).toEqual([
      'PATCH /users/me/preferences',
      'PUT /notifications/devices',
    ]);
    expect(allText(tree.root)).not.toContain(prs.account.morningMessagesBlocked);
  });

  it('keeps the choice but explains where to allow notifications when the phone refuses them', async () => {
    messaging.__state.permission = 0;
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    mockApi(fetchMock, { 'PATCH /users/me/preferences': patch });
    const tree = await mountIn(screen(), { ...baseUser, enable_daily_motivation: false, has_seen_welcome: true });
    await flip(tree.root, true);

    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(updatedUsers.at(-1)?.enable_daily_motivation).toBe(true);
    expect(allText(tree.root)).toContain(prs.account.morningMessagesBlocked);
    expect(callsTo(fetchMock).some(c => c.path === '/notifications/devices')).toBe(false);

    await press(tree.root, prs.account.openSettings);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('puts the switch back and says so when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const tree = await mountIn(screen());
    await flip(tree.root, false);

    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(toasts.messages).toContain(prs.errors.network);
    expect(updatedUsers.map(u => u.enable_daily_motivation)).toEqual([false, true]);
    expect(messaging.requestPermission).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first is still being saved', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementation((url: string) =>
      // The invite banner's own request is not the one being held back.
      new URL(url).pathname === '/referrals/me'
        ? new Promise(() => {})
        : new Promise(resolve => (finish = resolve)),
    );
    const tree = await mountIn(screen());
    await ReactTestRenderer.act(async () => {
      tree.root.findByType(Switch).props.onValueChange(false);
    });
    await ReactTestRenderer.act(async () => {
      tree.root.findByType(Switch).props.onValueChange(true);
    });
    expect(tree.root.findByType(Switch).props.disabled).toBe(true);
    expect(switchCalls()).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      finish(jsonResponse(200, { ...baseUser, enable_daily_motivation: false }));
    });
    await settle();
    expect(tree.root.findByType(Switch).props.disabled).toBe(false);
  });
});
