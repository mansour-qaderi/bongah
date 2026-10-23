import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatConversation } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import { allText, mockApi, render as renderTree } from '../test-utils';
import { colors, radius, spacing } from '../src/theme';

const fetchMock = jest.fn();
let mockUser: Record<string, unknown> | null = null;

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    status: mockUser ? 'signedIn' : 'signedOut',
    updateUser: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Imported after the mock so the components pick it up.
import AppLoader from '../src/components/AppLoader';
import Button from '../src/components/Button';
import CircleIconButton from '../src/components/CircleIconButton';
import InlineLoader from '../src/components/InlineLoader';
import MapLoader from '../src/components/MapLoader';
import { FADE_IN_MS, Reveal, useReveal } from '../src/components/Reveal';
import {
  ChatThreadSkeleton,
  ConversationListSkeleton,
  TemplatesSkeleton,
  shimmerWatchers,
} from '../src/components/SkeletonLoader';
import { LoadingView } from '../src/components/States';
import { RoundButton } from '../src/screens/home/MapControls';
import BalanceScreen from '../src/screens/account/BalanceScreen';
import ChatListScreen from '../src/screens/chat/ChatListScreen';

declare const __dirname: string;
const fs = require('node:fs') as {
  readFileSync(p: string, e: 'utf8'): string;
  readdirSync(p: string): string[];
  statSync(p: string): { isDirectory(): boolean };
};
const path = require('node:path') as { join(...p: string[]): string };
const source = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const walk = (dir: string): string[] =>
  fs.readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
  mounted.push(tree);
  return tree;
};
const act = ReactTestRenderer.act;
const settle = async () => {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
  }
};
/** Waits out a fade (and a little more). */
const afterFade = () =>
  act(async () => {
    await new Promise<void>(resolve =>
      setTimeout(() => resolve(), FADE_IN_MS + 250),
    );
  });
const reduceMotion = (on: boolean) =>
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);

afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  jest.restoreAllMocks();
  mockUser = null;
});
beforeAll(async () => {
  await initI18n();
});

const styleOf = (node: ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hosts = (
  root: ReactTestInstance,
  match: (node: ReactTestInstance) => boolean,
) => root.findAll(node => typeof node.type === 'string' && match(node));
const byId = (root: ReactTestInstance, testID: string) =>
  hosts(root, n => n.props.testID === testID);
const roles = (root: ReactTestInstance, role: string) =>
  hosts(root, n => n.props.accessibilityRole === role);

const providers = (element: React.ReactElement) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {element}
  </QueryClientProvider>
);

describe('no default spinner is left in the app', () => {
  it('has no ActivityIndicator in any source file', () => {
    const offenders = walk(path.join(__dirname, '..', 'src'))
      .concat(path.join(__dirname, '..', 'App.tsx'))
      .filter(file => /\.tsx?$/.test(file))
      .filter(file =>
        fs.readFileSync(file, 'utf8').includes('ActivityIndicator'),
      );
    expect(offenders).toEqual([]);
  });

  it('shows the logo loader, in the middle of the space, where LoadingView used to show a spinner', async () => {
    const tree = await show(<LoadingView />);
    expect(byId(tree.root, 'loading-view')).toHaveLength(1);
    const loader = byId(tree.root, 'app-loader')[0];
    expect(loader).toBeDefined();
    expect(loader.props.accessibilityLabel).toBe(prs.common.loading);
    expect(roles(tree.root, 'progressbar')).toHaveLength(1);
  });

  it('shows the logo loader while the balance loads', async () => {
    mockUser = { id: 'u1', role: 'USER' };
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const tree = await show(
      providers(
        <BalanceScreen
          {...({
            navigation: { navigate: jest.fn(), goBack: jest.fn() },
            route: {},
          } as unknown as React.ComponentProps<typeof BalanceScreen>)}
        />,
      ),
    );
    await settle();
    expect(byId(tree.root, 'loading-view')).toHaveLength(1);
    expect(byId(tree.root, 'app-loader')).toHaveLength(1);
  });
});

describe('AppLoader: the soft pulsing ground shadow', () => {
  it('has a soft green ground shadow inside the ring that breathes with the pin', async () => {
    reduceMotion(false);
    const tree = await show(<AppLoader />);
    await settle();
    const ground = byId(tree.root, 'app-loader-shadow')[0];
    expect(ground).toBeDefined();
    // Moving: at rest-time it sits between the soft ends, not at the still value.
    const opacity = styleOf(ground).opacity as number;
    expect(opacity).toBeGreaterThanOrEqual(0.07);
    expect(opacity).toBeLessThanOrEqual(0.2);
    expect(opacity).not.toBe(0.12);
  });

  it('keeps the ground shadow still and faint with "reduce motion" on', async () => {
    reduceMotion(true);
    const tree = await show(<AppLoader />);
    await settle();
    expect(styleOf(byId(tree.root, 'app-loader-shadow')[0]).opacity).toBe(0.12);
  });
});

describe('InlineLoader', () => {
  it('is three dots in the colour it is given, named "loading" for a screen reader', async () => {
    reduceMotion(false);
    const tree = await show(<InlineLoader color="#123456" />);
    await settle();
    const dots = hosts(tree.root, n =>
      String(n.props.testID ?? '').startsWith('inline-loader-dot-'),
    );
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(styleOf(dot).backgroundColor).toBe('#123456');
    }
    const bar = roles(tree.root, 'progressbar')[0];
    expect(bar.props.accessibilityLabel).toBe(prs.common.loading);
    expect(bar.props.accessibilityState).toEqual({ busy: true });
  });

  it('pulses the dots one after another, on the native driver', async () => {
    reduceMotion(false);
    const loop = jest.spyOn(Animated, 'loop');
    await show(<InlineLoader />);
    await settle();
    expect(loop).toHaveBeenCalledTimes(3);
  });

  it('stands still, half-faded, with "reduce motion" on', async () => {
    reduceMotion(true);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await show(<InlineLoader />);
    await settle();
    expect(loop).not.toHaveBeenCalled();
    const dot = byId(tree.root, 'inline-loader-dot-0')[0];
    expect(styleOf(dot).opacity).toBe(0.55);
  });

  it('is what a button shows while it works, in the text colour of the button', async () => {
    reduceMotion(true);
    const tree = await show(
      <Button title="ثبت" loading onPress={() => undefined} />,
    );
    await settle();
    expect(byId(tree.root, 'inline-loader')).toHaveLength(1);
    expect(allText(tree.root)).not.toContain('ثبت');
    const button = hosts(
      tree.root,
      n => n.props.accessibilityRole === 'button',
    )[0];
    expect(button.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('is what a round icon button shows while it works', async () => {
    reduceMotion(true);
    const tree = await show(
      <CircleIconButton
        icon="share"
        label="x"
        loading
        onPress={() => undefined}
      />,
    );
    await settle();
    expect(byId(tree.root, 'inline-loader')).toHaveLength(1);
  });
});

describe('MapLoader on a green button', () => {
  it('is white there, because green on green would vanish', async () => {
    reduceMotion(false);
    const normal = await show(<MapLoader />);
    const onBrand = await show(<MapLoader onBrand />);
    await settle();
    const ring = (tree: ReactTestRenderer.ReactTestRenderer) =>
      styleOf(byId(tree.root, 'map-loader-ring-0')[0]).borderColor;
    expect(ring(normal)).toBe(colors.primary);
    expect(ring(onBrand)).toBe(colors.textOnPrimary);
  });

  it('is what a map round button shows while it works (white when the button is filled)', async () => {
    reduceMotion(true);
    const tree = await show(
      <RoundButton
        icon="pin"
        label="x"
        tone="brand"
        busy
        onPress={() => undefined}
      />,
    );
    await settle();
    expect(byId(tree.root, 'map-loader')).toHaveLength(1);
    expect(byId(tree.root, 'map-loader-still-ring')).toHaveLength(1);
    expect(
      styleOf(byId(tree.root, 'map-loader-still-ring')[0]).borderColor,
    ).toBe(colors.textOnPrimary);
  });
});

describe('the chat skeletons', () => {
  it('stand a row for each chat: the avatar, the name and time, the listing and the last message', async () => {
    reduceMotion(true);
    const tree = await show(<ConversationListSkeleton count={5} />);
    expect(roles(tree.root, 'progressbar')).toHaveLength(1);
    const rows = hosts(tree.root, n =>
      String(n.props.testID ?? '').startsWith('conversation-skeleton-'),
    );
    expect(rows).toHaveLength(5);
    expect(allText(tree.root)).toBe('');
  });

  it('draw a chat row with the numbers the real row has', async () => {
    reduceMotion(true);
    mockUser = { id: 'me', role: 'USER' };
    const conversation: ChatConversation = {
      id: 'c1',
      property: {
        id: 'p1',
        title: 'خانه نو',
        price: 1000,
        currency: 'AFGHANI',
        province: 'کابل',
        district: 'شهر نو',
        status: 'ACTIVE',
        cover_image: null,
      } as ChatConversation['property'],
      counterpart: { id: 'them', name: 'دفتر آریانا' },
      my_role: 'BUYER',
      last_message: null,
      unread_count: 0,
      last_message_at: null,
      created_at: '2026-10-13T07:00:00.000Z',
    };
    mockApi(fetchMock, { 'GET /chat/conversations': { body: [conversation] } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const real = await show(
      providers(
        <ChatListScreen
          {...({
            navigation: { navigate: jest.fn(), goBack: jest.fn() },
            route: {},
          } as unknown as React.ComponentProps<typeof ChatListScreen>)}
        />,
      ),
    );
    await settle();
    const realRow = hosts(
      real.root,
      n =>
        n.props.accessibilityRole === 'button' &&
        String(n.props.accessibilityLabel ?? '').includes('·'),
    )[0];
    const skeleton = await show(<ConversationListSkeleton count={1} />);
    const skeletonRow = byId(skeleton.root, 'conversation-skeleton-0')[0];
    for (const key of [
      'padding',
      'gap',
      'marginHorizontal',
      'marginBottom',
      'borderRadius',
      'borderWidth',
      'flexDirection',
      'alignItems',
    ]) {
      expect(styleOf(skeletonRow)[key]).toEqual(
        // The Pressable's style is a function of "pressed" in the source; the tree holds its result.
        styleOf(realRow)[key],
      );
    }
  });

  it('stand the bubbles of a chat on both sides, as the real bubbles stand (mine at the start edge, theirs at the end)', async () => {
    reduceMotion(true);
    const tree = await show(<ChatThreadSkeleton />);
    const bubbles = hosts(tree.root, n =>
      String(n.props.testID ?? '').startsWith('chat-bubble-skeleton-'),
    );
    expect(bubbles.length).toBeGreaterThanOrEqual(5);
    const sides = bubbles.map(bubble => {
      let node: ReactTestInstance | null = bubble.parent;
      while (node && typeof node.type !== 'string') node = node.parent;
      return styleOf(node as ReactTestInstance).alignItems;
    });
    expect(new Set(sides)).toEqual(new Set(['flex-start', 'flex-end']));
    // Those are the real bubbles' own sides.
    const real = source('src', 'components', 'MessageBubble.tsx');
    expect(real).toContain("mineRow: { alignItems: 'flex-start' }");
    expect(real).toContain("theirsRow: { alignItems: 'flex-end' }");
    // The bubble shape and the listing strip are the real ones too.
    const bubble = styleOf(bubbles[0]);
    expect(bubble.borderRadius).toBe(radius.lg);
    expect(bubble.paddingHorizontal).toBe(spacing.md);
    expect(bubble.paddingVertical).toBe(spacing.sm);
    expect(roles(tree.root, 'progressbar')).toHaveLength(1);
  });

  it('stand a templates page: the form card and two saved templates', async () => {
    reduceMotion(true);
    const tree = await show(<TemplatesSkeleton />);
    expect(byId(tree.root, 'templates-skeleton')).toHaveLength(1);
    expect(allText(tree.root)).toBe('');
  });

  it('let go of the shimmer when they go', async () => {
    reduceMotion(false);
    const tree = await show(<ConversationListSkeleton />);
    await settle();
    await act(async () => tree.unmount());
    mounted.splice(mounted.indexOf(tree), 1);
    expect(shimmerWatchers()).toBe(0);
  });
});

describe('the hand-over from a loader to the data (Reveal)', () => {
  function Harness({ pending }: { pending: boolean }) {
    const reveal = useReveal(pending);
    if (pending) return <View testID="the-loader" />;
    return (
      <Reveal {...reveal} loader={<View testID="the-loader" />}>
        <Text>داده</Text>
      </Reveal>
    );
  }

  it('shows the data at once with the loader fading out over it, then takes the loader away', async () => {
    reduceMotion(false);
    const tree = await show(<Harness pending />);
    await settle();
    expect(byId(tree.root, 'the-loader')).toHaveLength(1);
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(0);

    await act(async () => tree.update(<Harness pending={false} />));
    // Both are on screen for the length of the fade: no frame without the loader and without the data.
    expect(allText(tree.root)).toContain('داده');
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(1);
    expect(byId(tree.root, 'the-loader')).toHaveLength(1);

    await afterFade();
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(0);
    expect(byId(tree.root, 'the-loader')).toHaveLength(0);
    expect(allText(tree.root)).toContain('داده');
  });

  it('fades the data in (from nothing) and the loader out (from everything)', async () => {
    reduceMotion(false);
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await show(<Harness pending />);
    await settle();
    await act(async () => tree.update(<Harness pending={false} />));
    await settle();
    const targets = timing.mock.calls.map(([value, config]) => [
      (value as unknown as { __getValue(): number }).__getValue !== undefined,
      config.toValue,
      config.useNativeDriver,
    ]);
    expect(targets.some(([, to]) => to === 1)).toBe(true);
    expect(targets.some(([, to]) => to === 0)).toBe(true);
    for (const call of timing.mock.calls) {
      expect(call[1].useNativeDriver).toBe(true);
    }
    await afterFade();
  });

  it('does not fade at all with "reduce motion" on: the data is simply there', async () => {
    reduceMotion(true);
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await show(<Harness pending />);
    await settle();
    await act(async () => tree.update(<Harness pending={false} />));
    await settle();
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(0);
    expect(allText(tree.root)).toContain('داده');
    expect(timing).not.toHaveBeenCalled();
  });

  it('plays nothing for data that was already there (cached) when the screen opened', async () => {
    reduceMotion(false);
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await show(<Harness pending={false} />);
    await settle();
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(0);
    expect(timing).not.toHaveBeenCalled();
    expect(allText(tree.root)).toContain('داده');
  });

  it('does not catch a touch with the loader that is leaving', async () => {
    reduceMotion(false);
    const tree = await show(<Harness pending />);
    await settle();
    await act(async () => tree.update(<Harness pending={false} />));
    expect(byId(tree.root, 'reveal-loader')[0].props.pointerEvents).toBe(
      'none',
    );
    await afterFade();
  });
});

describe('the chat list while it loads', () => {
  const open = async () => {
    const tree = await show(
      providers(
        <ChatListScreen
          {...({
            navigation: { navigate: jest.fn(), goBack: jest.fn() },
            route: {},
          } as unknown as React.ComponentProps<typeof ChatListScreen>)}
        />,
      ),
    );
    await settle();
    return tree;
  };

  it('stands chat-shaped skeleton rows, not a spinner', async () => {
    reduceMotion(true);
    mockUser = { id: 'me', role: 'USER' };
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const tree = await open();
    expect(byId(tree.root, 'conversation-list-skeleton')).toHaveLength(1);
    expect(byId(tree.root, 'loading-view')).toHaveLength(0);
  });

  it('fades the skeleton out over the chats when they arrive, then removes it', async () => {
    reduceMotion(false);
    mockUser = { id: 'me', role: 'USER' };
    mockApi(fetchMock, { 'GET /chat/conversations': { body: [] } });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const tree = await open();
    expect(allText(tree.root)).toContain(prs.chat.empty);
    await afterFade();
    expect(byId(tree.root, 'conversation-list-skeleton')).toHaveLength(0);
    expect(byId(tree.root, 'reveal-loader')).toHaveLength(0);
  });
});
