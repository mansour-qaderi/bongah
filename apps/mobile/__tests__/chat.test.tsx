import React from 'react';
import { Alert, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { launchImageLibrary } from 'react-native-image-picker';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ChatCapabilities,
  ChatConversation,
  ChatMessage,
} from '@bongah/shared-types';
import { ApiError } from '../src/api/client';
import { queryKeys } from '../src/api/hooks';
import { ChatProvider, useChat } from '../src/chat/ChatProvider';
import { allMessages, type MessagesData } from '../src/chat/messageCache';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import {
  allText,
  inputLabelled,
  mapParts,
  mockApi,
  pressableWith,
  render as renderTree,
  tapMap,
} from '../test-utils';
import { lastSocket, resetSockets } from '../test-utils/mockSocket';

const fetchMock = jest.fn();
let mockAuth: { status: string; user: unknown } = {
  status: 'signedIn',
  user: null,
};

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/navigation/useRequireAuth', () => ({
  useRequireAuth: () => (action: () => void) => action(),
}));

// Imported after the mocks so the screens pick them up.
import ChatListScreen from '../src/screens/chat/ChatListScreen';
import ChatScreen from '../src/screens/chat/ChatScreen';
import TemplatesScreen from '../src/screens/chat/TemplatesScreen';

const ME = {
  id: 'me',
  role: 'USER',
  phone_number: '+93700000000',
  full_name: null,
  avatar: null,
};
const AGENCY = { ...ME, role: 'AGENCY' };
const C1 = '33333333-3333-4333-8333-333333333333';
const PROPERTY = '11111111-1111-4111-8111-111111111111';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  conversation_id: C1,
  sender_id: 'them',
  type: 'TEXT',
  body: 'سلام، آگهی هنوز هست؟',
  image_url: null,
  lat: null,
  lng: null,
  is_auto_reply: false,
  client_id: '44444444-4444-4444-8444-444444444444',
  read_at: null,
  created_at: '2026-10-13T08:00:00.000Z',
  ...overrides,
});

const conversation = (
  overrides: Partial<ChatConversation> = {},
  propertyStatus = 'ACTIVE',
): ChatConversation => ({
  id: C1,
  property: {
    id: PROPERTY,
    title: 'خانه نو',
    price: 1000,
    currency: 'AFGHANI',
    province: 'کابل',
    district: 'شهر نو',
    status: propertyStatus,
    cover_image: null,
  } as ChatConversation['property'],
  counterpart: { id: 'them', name: 'دفتر آریانا' },
  my_role: 'BUYER',
  last_message: null,
  unread_count: 0,
  last_message_at: null,
  created_at: '2026-10-13T07:00:00.000Z',
  ...overrides,
});

const CAPS_BASIC: ChatCapabilities = {
  advanced: false,
  advanced_reason: null,
  limits: {
    text_max_length: 2000,
    image_max_bytes: 1_500_000,
    template_max_length: 500,
    templates_max: 10,
  },
};
const CAPS_ADVANCED: ChatCapabilities = {
  advanced: true,
  advanced_reason: 'AGENCY_SUBSCRIPTION',
  limits: { ...CAPS_BASIC.limits, image_max_bytes: 8_000_000 },
};

const page = (data: ChatMessage[], next: string | null = null) => ({
  data,
  next_cursor: next,
});

let queryClient: QueryClient;
const providers = (node: React.ReactElement) => (
  <QueryClientProvider client={queryClient}>
    <ChatProvider>{node}</ChatProvider>
  </QueryClientProvider>
);

const navigation = (focused = true) => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => focused),
  addListener: jest.fn(() => () => undefined),
});

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const render = async (element: React.ReactElement) => {
  const tree = await renderTree(element);
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
const press = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  act(async () => {
    pressableWith(root, label).props.onPress();
  });
/** Taps a control that is named by its accessibility label (an icon-like button has no text). */
const pressLabelled = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) =>
  act(async () => {
    const match = root
      .findAll(
        node =>
          typeof node.props.onPress === 'function' &&
          node.props.accessibilityLabel === label,
      )
      .shift();
    if (!match) throw new Error(`No control labelled "${label}"`);
    match.props.onPress();
  });
const typeInto = (root: ReactTestRenderer.ReactTestInstance, text: string) =>
  act(async () => {
    inputLabelled(root, prs.chat.inputLabel).props.onChangeText(text);
  });

/** mockApi, plus `file:` reads for picked pictures. */
function api(routes: Parameters<typeof mockApi>[1]) {
  mockApi(fetchMock, routes);
  const routed = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    String(url).startsWith('file:')
      ? { blob: async () => new Blob(['pixels']) }
      : routed(url, init),
  );
}
const requests = (method: string, path: string) =>
  fetchMock.mock.calls
    .filter(
      ([url, init]: [string, RequestInit?]) =>
        (init?.method ?? 'GET') === method && new URL(url).pathname === path,
    )
    .map(([, init]: [string, RequestInit]) => init);
const jsonBodies = (method: string, path: string) =>
  requests(method, path).map(init => JSON.parse(init.body as string));

const socket = () => lastSocket();
/** An ack that stores whatever was sent, like the server does. */
const storeOnSend = (payload: unknown) => {
  const { message: sent } = payload as {
    message: {
      type: ChatMessage['type'];
      client_id: string;
      body?: string;
      lat?: number;
      lng?: number;
    };
  };
  return {
    ok: true,
    message: message({
      id: `srv-${sent.client_id}`,
      sender_id: 'me',
      type: sent.type,
      body: sent.body ?? null,
      lat: sent.lat ?? null,
      lng: sent.lng ?? null,
      client_id: sent.client_id,
      created_at: '2026-10-13T09:00:00.000Z',
    }),
  };
};
const sentMessages = () =>
  socket()
    .sent('message:send')
    .map(p => (p as { message: Record<string, unknown> }).message);

const openChat = async (
  options: {
    conversation?: ChatConversation;
    messages?: ChatMessage[];
    caps?: ChatCapabilities;
    nav?: ReturnType<typeof navigation>;
    extra?: Parameters<typeof mockApi>[1];
  } = {},
) => {
  const conv = options.conversation ?? conversation();
  api({
    'GET /chat/conversations': { body: [conv] },
    'GET /chat/capabilities': { body: options.caps ?? CAPS_BASIC },
    [`GET /chat/conversations/${C1}/messages`]: {
      body: page(options.messages ?? []),
    },
    [`POST /chat/conversations/${C1}/read`]: { body: { marked: 1 } },
    'GET /chat/templates': { body: [] },
    ...options.extra,
  });
  const nav = options.nav ?? navigation();
  const tree = await render(
    providers(
      <ChatScreen
        {...({
          navigation: nav,
          route: { params: { conversation: conv } },
        } as unknown as React.ComponentProps<typeof ChatScreen>)}
      />,
    ),
  );
  await settle();
  await act(async () => {
    socket().connect();
    socket().acks['message:send'] = storeOnSend;
  });
  await settle();
  return { tree, nav };
};

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  fetchMock.mockReset();
  resetSockets();
  (launchImageLibrary as jest.Mock).mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  mockAuth = { status: 'signedIn', user: ME };
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.restoreAllMocks();
});

// ───────────────────────────── the live connection ─────────────────────────────

describe('ChatProvider', () => {
  let chat!: ReturnType<typeof useChat>;
  function Probe() {
    chat = useChat();
    return null;
  }
  const mount = async () => {
    api({
      [`POST /chat/conversations/${C1}/messages`]: (init: RequestInit) => {
        const sent = JSON.parse(init.body as string);
        return { status: 201, body: storeOnSend({ message: sent }).message };
      },
    });
    const tree = await render(providers(<Probe />));
    await act(async () => {
      socket().connect();
    });
    return tree;
  };
  const seed = (data: ChatMessage[]) =>
    queryClient.setQueryData<MessagesData>(queryKeys.messages(C1), {
      pages: [page(data)],
      pageParams: [undefined],
    });
  const cached = () =>
    allMessages(queryClient.getQueryData<MessagesData>(queryKeys.messages(C1)));

  it('connects once signed in, with a token function so reconnects use the current one', async () => {
    await mount();
    expect(socket().options.transports).toEqual(['websocket']);
    expect(typeof socket().options.auth).toBe('function');
    expect(chat.connected).toBe(true);
  });

  it('does not connect while signed out', async () => {
    mockAuth = { status: 'signedOut', user: null };
    await render(providers(<Probe />));
    expect(lastSocket()).toBeUndefined();
    expect(chat.connected).toBe(false);
  });

  it('closes the connection when the person signs out', async () => {
    const tree = await mount();
    const first = socket();
    mockAuth = { status: 'signedOut', user: null };
    await act(async () => {
      tree.update(providers(<Probe />));
    });
    expect(first.connected).toBe(false);
  });

  it('puts a pushed message into the open history, once', async () => {
    await mount();
    seed([message({ id: 'old' })]);
    const incoming = message({ id: 'new', body: 'تازه' });
    await act(async () => {
      socket().serverEmit('message:new', incoming);
      socket().serverEmit('message:new', incoming);
    });
    expect(cached().map(m => m.id)).toEqual(['new', 'old']);
  });

  it('marks my messages read when the other person reads, and refreshes my unread count when I read elsewhere', async () => {
    await mount();
    seed([message({ id: 'mine', sender_id: 'me' })]);
    await act(async () => {
      socket().serverEmit('message:read', {
        conversation_id: C1,
        reader_id: 'them',
        read_at: '2026-10-13T10:00:00.000Z',
      });
    });
    expect(cached()[0].read_at).toBe('2026-10-13T10:00:00.000Z');

    const refetch = jest.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      socket().serverEmit('message:read', {
        conversation_id: C1,
        reader_id: 'me',
        read_at: '2026-10-13T10:05:00.000Z',
      });
    });
    expect(refetch).toHaveBeenCalledWith({ queryKey: queryKeys.conversations });
  });

  it('shows typing from the other person and clears it when they send', async () => {
    await mount();
    await act(async () => {
      socket().serverEmit('typing', {
        conversation_id: C1,
        user_id: 'them',
        is_typing: true,
      });
    });
    expect(chat.typing[C1]).toBe(true);
    await act(async () => {
      socket().serverEmit('message:new', message({ id: 'x' }));
    });
    expect(chat.typing[C1]).toBe(false);
  });

  it('forgets "typing…" when the stop signal is lost', async () => {
    jest.useFakeTimers();
    try {
      await mount();
      await act(async () => {
        socket().serverEmit('typing', {
          conversation_id: C1,
          user_id: 'them',
          is_typing: true,
        });
      });
      expect(chat.typing[C1]).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(6_000);
      });
      expect(chat.typing[C1]).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends over the socket and stores the acknowledged copy', async () => {
    await mount();
    seed([]);
    socket().acks['message:send'] = storeOnSend;
    const sent = await chat.send(C1, {
      type: 'TEXT',
      client_id: '55555555-5555-4555-8555-555555555555',
      body: 'سلام',
    });
    expect(sent.id).toBe('srv-55555555-5555-4555-8555-555555555555');
    expect(cached()[0].id).toBe(sent.id);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything(),
    );
  });

  it('treats the server\'s "no" as final: it throws the code and does not retry over HTTP', async () => {
    await mount();
    socket().acks['message:send'] = {
      ok: false,
      code: 'LISTING_NOT_ACTIVE',
      message: 'closed',
      status: 409,
    };
    const error = await chat
      .send(C1, {
        type: 'TEXT',
        client_id: '55555555-5555-4555-8555-555555555555',
        body: 'x',
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('LISTING_NOT_ACTIVE');
    expect(requests('POST', `/chat/conversations/${C1}/messages`)).toHaveLength(
      0,
    );
  });

  it('falls back to HTTP with the same client_id when the socket does not answer', async () => {
    await mount();
    socket().acks['message:send'] = 'timeout';
    const clientId = '55555555-5555-4555-8555-555555555555';
    const sent = await chat.send(C1, {
      type: 'TEXT',
      client_id: clientId,
      body: 'سلام',
    });
    expect(sent.client_id).toBe(clientId);
    expect(jsonBodies('POST', `/chat/conversations/${C1}/messages`)).toEqual([
      { type: 'TEXT', client_id: clientId, body: 'سلام' },
    ]);
  });

  it('sends over HTTP while the connection is down', async () => {
    await mount();
    await act(async () => {
      socket().disconnect();
    });
    await chat.send(C1, {
      type: 'TEXT',
      client_id: '55555555-5555-4555-8555-555555555555',
      body: 'سلام',
    });
    expect(socket().sent('message:send')).toHaveLength(0);
    expect(requests('POST', `/chat/conversations/${C1}/messages`)).toHaveLength(
      1,
    );
  });

  it('tells the other person when I start typing, only while connected', async () => {
    await mount();
    chat.setTyping(C1, true);
    expect(socket().sent('typing')).toEqual([
      { conversation_id: C1, is_typing: true },
    ]);
    await act(async () => {
      socket().disconnect();
    });
    chat.setTyping(C1, false);
    expect(socket().sent('typing')).toHaveLength(1);
  });
});

// ───────────────────────────── the conversation list ─────────────────────────────

describe('ChatListScreen', () => {
  const list = async (
    conversations: ChatConversation[],
    nav = navigation(),
  ) => {
    api({ 'GET /chat/conversations': { body: conversations } });
    const tree = await render(
      providers(
        <ChatListScreen
          {...({
            navigation: nav,
            route: {},
          } as unknown as React.ComponentProps<typeof ChatListScreen>)}
        />,
      ),
    );
    await settle();
    return { tree, nav };
  };

  it('asks a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree, nav } = await list([]);
    expect(allText(tree.root)).toContain(prs.chat.signInHint);
    await press(tree.root, prs.auth.signIn);
    expect(nav.navigate).toHaveBeenCalledWith('Auth');
  });

  it('says so when there are no conversations', async () => {
    const { tree } = await list([]);
    expect(allText(tree.root)).toContain(prs.chat.empty);
  });

  it('shows who, which listing, the last message, and the unread count', async () => {
    const last = message({ id: 'l', body: 'قیمت چند است؟' });
    const { tree } = await list([
      conversation({
        last_message: last,
        last_message_at: last.created_at,
        unread_count: 3,
      }),
    ]);
    const text = allText(tree.root);
    expect(text).toContain('دفتر آریانا');
    expect(text).toContain('خانه نو');
    expect(text).toContain('قیمت چند است؟');
    expect(text).toContain(formatNumber(3, 0));
  });

  it('prefixes my own last message and summarises pictures', async () => {
    const mine = message({
      id: 'l',
      sender_id: 'me',
      type: 'IMAGE',
      body: null,
    });
    const { tree } = await list([
      conversation({ last_message: mine, last_message_at: mine.created_at }),
    ]);
    expect(allText(tree.root)).toContain(`${prs.chat.you} ${prs.chat.photo}`);
  });

  it('opens the conversation when tapped', async () => {
    const conv = conversation({
      last_message: message(),
      last_message_at: '2026-10-13T08:00:00.000Z',
    });
    const { tree, nav } = await list([conv]);
    await press(tree.root, 'دفتر آریانا');
    expect(nav.navigate).toHaveBeenCalledWith('Chat', { conversation: conv });
  });

  it('puts the first letter of the name in the avatar', async () => {
    const { tree } = await list([
      conversation({
        last_message: message(),
        last_message_at: '2026-10-13T08:00:00.000Z',
      }),
    ]);
    expect(allText(tree.root)).toContain('د'); // دفتر آریانا
  });

  it('caps a long unread count at ۹۹ and still labels it in full', async () => {
    const { tree } = await list([
      conversation({
        last_message: message(),
        last_message_at: '2026-10-13T08:00:00.000Z',
        unread_count: 250,
      }),
    ]);
    expect(allText(tree.root)).toContain(formatNumber(99, 0));
    expect(allText(tree.root)).not.toContain(formatNumber(250, 0));
    const badge = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel ===
          prs.chat.unread.replace('{{count}}', '250'),
    );
    expect(badge.length).toBeGreaterThan(0);
  });

  it('shows no unread badge for a read conversation', async () => {
    const { tree } = await list([
      conversation({
        last_message: message(),
        last_message_at: '2026-10-13T08:00:00.000Z',
        unread_count: 0,
      }),
    ]);
    const badge = tree.root.findAll(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('خوانده‌نشده'),
    );
    expect(badge).toHaveLength(0);
  });
});

// ───────────────────────────── one conversation ─────────────────────────────

describe('ChatScreen', () => {
  it('shows the listing card on top, which opens the listing', async () => {
    const { tree, nav } = await openChat();
    const text = allText(tree.root);
    expect(text).toContain('خانه نو');
    await press(tree.root, prs.chat.viewListing);
    expect(nav.navigate).toHaveBeenCalledWith('PropertyDetails', {
      id: PROPERTY,
    });
  });

  it('shows the history with a read tick on my messages that were seen', async () => {
    const { tree } = await openChat({
      messages: [
        message({
          id: 'a',
          sender_id: 'me',
          body: 'دیده شد',
          read_at: '2026-10-13T08:05:00.000Z',
        }),
        message({
          id: 'b',
          sender_id: 'me',
          body: 'نه هنوز',
          client_id: '66666666-6666-4666-8666-666666666666',
        }),
        message({
          id: 'c',
          body: 'از طرف آنها',
          client_id: '77777777-7777-4777-8777-777777777777',
        }),
      ],
    });
    const text = allText(tree.root);
    expect(text).toContain('دیده شد');
    expect(text).toContain('✓✓');
    expect(text).toContain('✓');
  });

  it("labels the seller's automatic reply", async () => {
    const { tree } = await openChat({
      messages: [message({ id: 'auto', is_auto_reply: true })],
    });
    expect(allText(tree.root)).toContain(prs.chat.autoReply);
  });

  it('sends a typed message once, over the socket, with a client id, and shows it once', async () => {
    const { tree } = await openChat();
    await typeInto(tree.root, '  سلام، قیمت؟  ');
    await press(tree.root, prs.chat.send);
    await settle();

    const sent = sentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'TEXT', body: 'سلام، قیمت؟' });
    expect(sent[0].client_id).toMatch(/^[0-9a-f-]{36}$/);
    // The input is cleared and the message appears exactly once (not as both pending and stored).
    expect(inputLabelled(tree.root, prs.chat.inputLabel).props.value).toBe('');
    expect(allText(tree.root).split('سلام، قیمت؟')).toHaveLength(2);
    expect(allText(tree.root)).not.toContain(prs.chat.sending);
  });

  it('does not send an empty message', async () => {
    const { tree } = await openChat();
    await typeInto(tree.root, '   ');
    expect(pressableWith(tree.root, prs.chat.send).props.disabled).toBe(true);
    expect(sentMessages()).toHaveLength(0);
  });

  it('keeps a failed message, says why, and retries it with the same client id', async () => {
    const { tree } = await openChat();
    socket().acks['message:send'] = {
      ok: false,
      code: 'CHAT_RATE_LIMITED',
      message: 'slow',
      status: 429,
      retry_after: 5,
    };
    await typeInto(tree.root, 'سلام');
    await press(tree.root, prs.chat.send);
    await settle();
    expect(allText(tree.root)).toContain(prs.chat.failed);
    expect(allText(tree.root)).toContain(prs.chat.slowDown);

    socket().acks['message:send'] = storeOnSend;
    await press(tree.root, prs.chat.tapToRetry);
    await settle();
    const sent = sentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[1].client_id).toBe(sent[0].client_id);
    expect(allText(tree.root)).not.toContain(prs.chat.failed);
  });

  it('lets a failed message be discarded', async () => {
    const { tree } = await openChat();
    socket().acks['message:send'] = {
      ok: false,
      code: 'LISTING_NOT_ACTIVE',
      message: 'closed',
      status: 409,
    };
    await typeInto(tree.root, 'سلام');
    await press(tree.root, prs.chat.send);
    await settle();
    await press(tree.root, prs.common.delete);
    expect(allText(tree.root)).not.toContain(prs.chat.failed);
  });

  it('shows "typing…" while the other person types', async () => {
    const { tree } = await openChat();
    expect(allText(tree.root)).not.toContain(prs.chat.typing);
    await act(async () => {
      socket().serverEmit('typing', {
        conversation_id: C1,
        user_id: 'them',
        is_typing: true,
      });
    });
    expect(allText(tree.root)).toContain(prs.chat.typing);
  });

  it('tells the other person while I type, and when I stop', async () => {
    const { tree } = await openChat();
    await typeInto(tree.root, 'س');
    expect(socket().sent('typing')).toEqual([
      { conversation_id: C1, is_typing: true },
    ]);
    await typeInto(tree.root, 'سل');
    expect(socket().sent('typing')).toHaveLength(1); // not once per keystroke
    await typeInto(tree.root, '');
    expect(socket().sent('typing')).toEqual([
      { conversation_id: C1, is_typing: true },
      { conversation_id: C1, is_typing: false },
    ]);
  });

  it('marks the conversation read when it is on screen and has unread messages', async () => {
    await openChat({
      conversation: conversation({ unread_count: 1 }),
      messages: [message()],
    });
    expect(requests('POST', `/chat/conversations/${C1}/read`)).toHaveLength(1);
  });

  it('marks a message that arrives while the screen is open, once', async () => {
    await openChat({
      messages: [message({ read_at: '2026-10-13T08:01:00.000Z' })],
    });
    expect(requests('POST', `/chat/conversations/${C1}/read`)).toHaveLength(0);
    await act(async () => {
      socket().serverEmit(
        'message:new',
        message({
          id: 'fresh',
          client_id: '88888888-8888-4888-8888-888888888888',
        }),
      );
    });
    await settle();
    expect(requests('POST', `/chat/conversations/${C1}/read`)).toHaveLength(1);
  });

  it('does not mark anything read while another screen is on top', async () => {
    await openChat({
      nav: navigation(false),
      conversation: conversation({ unread_count: 1 }),
      messages: [message()],
    });
    expect(requests('POST', `/chat/conversations/${C1}/read`)).toHaveLength(0);
  });

  it('closes the composer for a listing that is no longer active', async () => {
    const { tree } = await openChat({
      conversation: conversation({}, 'ARCHIVED'),
    });
    expect(allText(tree.root)).toContain(prs.chat.listingClosed);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  describe('pictures', () => {
    const pick = (asset: Record<string, unknown>) =>
      (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
        assets: [asset],
      });
    const attach = async (tree: ReactTestRenderer.ReactTestRenderer) => {
      await pressLabelled(tree.root, prs.chat.attach);
      await press(tree.root, prs.chat.attachPhoto);
      await settle();
    };

    it('shrinks the photo for a regular account, uploads it as raw bytes, then sends it', async () => {
      pick({ uri: 'file:///a.jpg', type: 'image/jpeg', fileSize: 400_000 });
      const { tree } = await openChat({
        extra: {
          'POST /chat/images': {
            status: 201,
            body: {
              id: '99999999-9999-4999-8999-999999999999',
              url: '/chat/images/x',
              content_type: 'image/jpeg',
              byte_size: 400000,
            },
          },
        },
      });
      await attach(tree);

      expect((launchImageLibrary as jest.Mock).mock.calls[0][0]).toMatchObject({
        maxWidth: 1280,
        quality: 0.7,
      });
      const [upload] = requests('POST', '/chat/images');
      expect((upload.headers as Record<string, string>)['Content-Type']).toBe(
        'image/jpeg',
      );
      expect(upload.body).toBeInstanceOf(Blob);
      expect(sentMessages()).toHaveLength(1);
      expect(sentMessages()[0]).toMatchObject({
        type: 'IMAGE',
        image_id: '99999999-9999-4999-8999-999999999999',
      });
    });

    it('asks for a sharper, larger photo for an agency with perks', async () => {
      pick({ uri: 'file:///a.jpg', type: 'image/jpeg', fileSize: 3_000_000 });
      const { tree } = await openChat({
        caps: CAPS_ADVANCED,
        extra: {
          'POST /chat/images': {
            status: 201,
            body: {
              id: '99999999-9999-4999-8999-999999999999',
              url: '/chat/images/x',
              content_type: 'image/jpeg',
              byte_size: 3000000,
            },
          },
          'GET /chat/templates': { body: [] },
        },
      });
      await attach(tree);
      expect((launchImageLibrary as jest.Mock).mock.calls[0][0]).toMatchObject({
        maxWidth: 2560,
        quality: 0.9,
      });
      expect(requests('POST', '/chat/images')).toHaveLength(1);
    });

    it('refuses a picture type the server would refuse, without uploading', async () => {
      pick({ uri: 'file:///a.gif', type: 'image/gif', fileSize: 1000 });
      const { tree } = await openChat();
      await attach(tree);
      expect(allText(tree.root)).toContain(prs.chat.imageUnsupported);
      expect(requests('POST', '/chat/images')).toHaveLength(0);
    });

    it("refuses a picture over the account's size limit, without uploading", async () => {
      pick({ uri: 'file:///a.jpg', type: 'image/jpeg', fileSize: 2_000_000 });
      const { tree } = await openChat();
      await attach(tree);
      expect(allText(tree.root)).toContain(prs.chat.imageTooLarge);
      expect(requests('POST', '/chat/images')).toHaveLength(0);
    });

    it('does not upload again when only the send failed and is retried', async () => {
      pick({ uri: 'file:///a.jpg', type: 'image/jpeg', fileSize: 1000 });
      const { tree } = await openChat({
        extra: {
          'POST /chat/images': {
            status: 201,
            body: {
              id: '99999999-9999-4999-8999-999999999999',
              url: '/chat/images/x',
              content_type: 'image/jpeg',
              byte_size: 1000,
            },
          },
        },
      });
      socket().acks['message:send'] = {
        ok: false,
        code: 'CHAT_RATE_LIMITED',
        message: 'slow',
        status: 429,
      };
      await attach(tree);
      expect(allText(tree.root)).toContain(prs.chat.failed);
      socket().acks['message:send'] = storeOnSend;
      await press(tree.root, prs.chat.tapToRetry);
      await settle();
      expect(requests('POST', '/chat/images')).toHaveLength(1);
      expect(sentMessages()).toHaveLength(2);
    });
  });

  describe('location pins', () => {
    it('are locked for accounts without agency perks', async () => {
      const { tree } = await openChat();
      await pressLabelled(tree.root, prs.chat.attach);
      expect(allText(tree.root)).toContain(prs.chat.agencyOnly);
      expect(
        pressableWith(tree.root, prs.chat.attachLocation).props.disabled,
      ).toBe(true);
    });

    it('let an agency with perks pick a point on the map and send it', async () => {
      const { tree } = await openChat({ caps: CAPS_ADVANCED });
      await pressLabelled(tree.root, prs.chat.attach);
      await press(tree.root, prs.chat.attachLocation);
      expect(
        pressableWith(tree.root, prs.chat.locationSend).props.disabled,
      ).toBe(true);

      await act(async () => {
        tapMap(tree.root, 'location-picker-map', [69.17, 34.53]);
      });
      expect(mapParts(tree.root, 'Marker')).toHaveLength(1);
      await press(tree.root, prs.chat.locationSend);
      await settle();

      expect(sentMessages()[0]).toMatchObject({
        type: 'LOCATION',
        lat: 34.53,
        lng: 69.17,
      });
    });

    it('refuse a point outside Afghanistan', async () => {
      const { tree } = await openChat({ caps: CAPS_ADVANCED });
      await pressLabelled(tree.root, prs.chat.attach);
      await press(tree.root, prs.chat.attachLocation);
      await act(async () => {
        tapMap(tree.root, 'location-picker-map', [2.35, 48.85]); // Paris
      });
      expect(allText(tree.root)).toContain(prs.chat.locationOutside);
      expect(
        pressableWith(tree.root, prs.chat.locationSend).props.disabled,
      ).toBe(true);
    });

    it("are drawn on a map with a link to the phone's maps app", async () => {
      const { tree } = await openChat({
        messages: [
          message({ type: 'LOCATION', body: null, lat: 34.53, lng: 69.17 }),
        ],
      });
      expect(mapParts(tree.root, 'Marker').length).toBeGreaterThan(0);
      expect(allText(tree.root)).toContain(prs.chat.openInMaps);
    });
  });

  describe('quick replies', () => {
    const templates = [
      {
        id: 't1',
        body: 'سلام، آگهی فعال است. چه زمانی می‌آیید؟',
        is_auto_reply: false,
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    it('put a saved reply into the box for an agency with perks, to edit before sending', async () => {
      const nav = navigation();
      const { tree } = await openChat({
        caps: CAPS_ADVANCED,
        nav,
        extra: { 'GET /chat/templates': { body: templates } },
      });
      await press(tree.root, 'سلام، آگهی فعال است');
      expect(inputLabelled(tree.root, prs.chat.inputLabel).props.value).toBe(
        templates[0].body,
      );
      expect(sentMessages()).toHaveLength(0);

      await press(tree.root, prs.chat.manageReplies);
      expect(nav.navigate).toHaveBeenCalledWith('Templates');
    });

    it('are not offered to other accounts, and their saved replies are not even requested', async () => {
      const { tree } = await openChat();
      expect(allText(tree.root)).not.toContain(prs.chat.manageReplies);
      expect(requests('GET', '/chat/templates')).toHaveLength(0);
    });
  });
});

// ───────────────────────────── saved replies ─────────────────────────────

describe('TemplatesScreen', () => {
  const T1 = {
    id: 't1',
    body: 'پاسخ اول',
    is_auto_reply: true,
    created_at: '2026-10-01T00:00:00Z',
  };
  const T2 = {
    id: 't2',
    body: 'پاسخ دوم',
    is_auto_reply: false,
    created_at: '2026-10-02T00:00:00Z',
  };

  const open = async (
    caps: ChatCapabilities,
    list: unknown[],
    extra: Parameters<typeof mockApi>[1] = {},
    nav = navigation(),
  ) => {
    api({
      'GET /chat/capabilities': { body: caps },
      'GET /chat/templates': { body: list },
      ...extra,
    });
    const tree = await render(
      providers(
        <TemplatesScreen
          {...({
            navigation: nav,
            route: {},
          } as unknown as React.ComponentProps<typeof TemplatesScreen>)}
        />,
      ),
    );
    await settle();
    return { tree, nav };
  };

  beforeEach(() => {
    mockAuth = { status: 'signedIn', user: AGENCY };
  });

  it('asks a signed-out visitor to sign in', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const { tree } = await open(CAPS_BASIC, []);
    expect(allText(tree.root)).toContain(prs.templates.signInHint);
  });

  it('explains the feature and offers a subscription to an account without perks', async () => {
    const { tree, nav } = await open(CAPS_BASIC, []);
    expect(allText(tree.root)).toContain(prs.templates.lockedTitle);
    expect(requests('GET', '/chat/templates')).toHaveLength(0);
    await press(tree.root, prs.templates.subscribe);
    expect(nav.navigate).toHaveBeenCalledWith('Checkout', {
      tab: 'subscription',
    });
  });

  it('lists the saved replies, marks the automatic one and shows the count', async () => {
    const { tree } = await open(CAPS_ADVANCED, [T1, T2]);
    const text = allText(tree.root);
    expect(text).toContain('پاسخ اول');
    expect(text).toContain('پاسخ دوم');
    expect(text).toContain(prs.templates.autoOn);
    expect(text).toContain(
      prs.templates.count
        .replace('{{count}}', formatNumber(2, 0))
        .replace('{{max}}', formatNumber(10, 0)),
    );
  });

  it('adds a reply', async () => {
    const { tree } = await open(CAPS_ADVANCED, [], {
      'POST /chat/templates': { status: 201, body: T2 },
    });
    await act(async () => {
      inputLabelled(tree.root, prs.templates.bodyLabel).props.onChangeText(
        'پاسخ دوم',
      );
    });
    await press(tree.root, prs.templates.add);
    await settle();
    expect(jsonBodies('POST', '/chat/templates')).toEqual([
      { body: 'پاسخ دوم', is_auto_reply: false },
    ]);
  });

  it('does not allow an empty reply', async () => {
    const { tree } = await open(CAPS_ADVANCED, []);
    expect(pressableWith(tree.root, prs.templates.add).props.disabled).toBe(
      true,
    );
  });

  it('edits a reply in place', async () => {
    const { tree } = await open(CAPS_ADVANCED, [T2], {
      'PATCH /chat/templates/t2': { body: { ...T2, body: 'تغییر کرد' } },
    });
    await press(tree.root, prs.templates.edit);
    expect(inputLabelled(tree.root, prs.templates.bodyLabel).props.value).toBe(
      'پاسخ دوم',
    );
    await act(async () => {
      inputLabelled(tree.root, prs.templates.bodyLabel).props.onChangeText(
        'تغییر کرد',
      );
    });
    await press(tree.root, prs.templates.update);
    await settle();
    expect(jsonBodies('PATCH', '/chat/templates/t2')).toEqual([
      { body: 'تغییر کرد', is_auto_reply: false },
    ]);
  });

  it('turns the automatic reply on for another reply', async () => {
    const { tree } = await open(CAPS_ADVANCED, [T1, T2], {
      'PATCH /chat/templates/t2': { body: { ...T2, is_auto_reply: true } },
    });
    await press(tree.root, prs.templates.makeAuto);
    await settle();
    expect(jsonBodies('PATCH', '/chat/templates/t2')).toEqual([
      { is_auto_reply: true },
    ]);
  });

  it('deletes only after confirmation', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const { tree } = await open(CAPS_ADVANCED, [T2], {
      'DELETE /chat/templates/t2': { status: 204 },
    });
    await press(tree.root, prs.common.delete);
    expect(requests('DELETE', '/chat/templates/t2')).toHaveLength(0);

    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find(b => b.text === prs.common.delete)!.onPress!();
    });
    await settle();
    expect(requests('DELETE', '/chat/templates/t2')).toHaveLength(1);
  });

  it('stops adding at the limit', async () => {
    const caps = {
      ...CAPS_ADVANCED,
      limits: { ...CAPS_ADVANCED.limits, templates_max: 1 },
    };
    const { tree } = await open(caps, [T2]);
    expect(allText(tree.root)).toContain(prs.chat.templateLimit);
    expect(pressableWith(tree.root, prs.templates.add).props.disabled).toBe(
      true,
    );
  });
});
