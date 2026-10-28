// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ChatConversation, ChatMessage } from '@bongah/shared-types';

const post = vi.fn();
const get = vi.fn();
const toastError = vi.fn();
const swrMutate = vi.fn(async () => undefined);
let conversations: ChatConversation[] | undefined;
let thread: { data: ChatMessage[]; next_cursor: string | null } | undefined;

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));
vi.mock('swr', () => ({ default: () => ({ data: undefined }), mutate: (...a: unknown[]) => swrMutate(...(a as [])) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } };
});
vi.mock('@/hooks/use-api', () => ({
  useConversations: () => ({ data: conversations, error: undefined, mutate: vi.fn() }),
  useThread: () => ({ data: thread, error: undefined, mutate: vi.fn(async () => undefined) }),
}));

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { ChatView } from '@/components/chat/chat-view';
import { inFilter, matchesQuery, osmLink, chatImageSrc, sortConversations, threadOrder, unreadTotal } from '@/lib/chat';
import { NAV_ITEMS, titleKeyFor } from '@/components/layout/nav';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);

const message = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  conversation_id: 'c1',
  sender_id: 'cust',
  type: 'TEXT',
  body: id,
  image_url: null,
  lat: null,
  lng: null,
  is_auto_reply: false,
  client_id: id,
  read_at: null,
  created_at: '2026-10-28T10:00:00.000Z',
  ...over,
});

const conv = (id: string, over: Partial<ChatConversation> = {}): ChatConversation => ({
  id,
  property: { id: 'p', title: 'خانه در هرات', price: 5_000_000, currency: 'AFGHANI', province: 'هرات', district: 'ناحیه ۴', status: 'ACTIVE', cover_image: null },
  counterpart: { id: 'cust', name: 'احمد ظاهر' },
  my_role: 'SELLER',
  last_message: message('m-last', { body: 'سلام، قیمت آخر چند است؟' }),
  unread_count: 0,
  last_message_at: '2026-10-28T10:00:00.000Z',
  created_at: '2026-10-27T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ marked: 0 });
  get.mockReset();
  toastError.mockReset();
  swrMutate.mockReset();
  swrMutate.mockResolvedValue(undefined);
  conversations = undefined;
  thread = undefined;
});
afterEach(() => cleanup());

const mount = () => render(<LanguageProvider initialLanguage="prs"><ChatView /></LanguageProvider>);

describe('chat helpers', () => {
  it('splits customers (they wrote to me) from my own questions', () => {
    const mine = conv('a', { my_role: 'BUYER' });
    const customer = conv('b');
    expect([mine, customer].filter((c) => inFilter(c, 'CUSTOMERS')).map((c) => c.id)).toEqual(['b']);
    expect([mine, customer].filter((c) => inFilter(c, 'MINE')).map((c) => c.id)).toEqual(['a']);
    expect([mine, customer].filter((c) => inFilter(c, 'ALL'))).toHaveLength(2);
  });

  it('searches the name and the listing, whatever the Arabic/Persian spelling of ی and ک', () => {
    const c = conv('a', { counterpart: { id: 'x', name: 'کریم' } });
    expect(matchesQuery(c, 'كريم')).toBe(true);
    expect(matchesQuery(c, 'هرات')).toBe(true);
    expect(matchesQuery(c, 'کابل')).toBe(false);
    expect(matchesQuery(c, '  ')).toBe(true);
  });

  it('orders conversations by the latest message and counts the unread', () => {
    const list = [conv('old', { last_message_at: '2026-10-01T00:00:00Z', unread_count: 1 }), conv('new', { last_message_at: '2026-10-28T00:00:00Z', unread_count: 2 })];
    expect(sortConversations(list).map((c) => c.id)).toEqual(['new', 'old']);
    expect(unreadTotal(list)).toBe(3);
    expect(unreadTotal(undefined)).toBe(0);
  });

  it('reads a thread oldest to newest and merges pages without repeats', () => {
    const newestFirst = [message('3', { created_at: '2026-10-28T12:00:00Z' }), message('2', { created_at: '2026-10-28T11:00:00Z' })];
    const older = [message('2', { created_at: '2026-10-28T11:00:00Z' }), message('1', { created_at: '2026-10-28T10:00:00Z' })];
    expect(threadOrder(older, newestFirst).map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('builds links for a picture (through the proxy) and a location', () => {
    expect(chatImageSrc('/chat/images/abc')).toBe('/api/bongah/chat/images/abc');
    expect(osmLink(34.5, 69.1)).toContain('mlat=34.5&mlon=69.1');
  });

  it('has a «گفتگو با مشتریان» link in the dashboard menu', () => {
    expect(NAV_ITEMS.some((i) => i.href === '/dashboard/chat' && i.labelKey === 'nav.chat')).toBe(true);
    expect(titleKeyFor('/dashboard/chat')).toBe('nav.chat');
  });
});

describe('the chat tab', () => {
  it('lists the customers with their unread count, and filters between customers and my own chats', () => {
    conversations = [conv('a', { unread_count: 2 }), conv('b', { my_role: 'BUYER', counterpart: { id: 'o', name: 'مالک' } })];
    mount();
    expect(screen.getAllByTestId('chat-row')).toHaveLength(2);
    expect(screen.getByLabelText(t('chat.unread', { n: '۲' }))).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(t('chat.tab.CUSTOMERS')) }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(t('chat.tab.CUSTOMERS')) }));
    const rows = screen.getAllByTestId('chat-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('احمد ظاهر');
  });

  it('says there is nothing yet, and what to expect', () => {
    conversations = [];
    mount();
    expect(screen.getByText(t('chat.empty.title'))).toBeTruthy();
    expect(screen.getByText(t('chat.empty.text'))).toBeTruthy();
  });

  it('opens a thread with the customer\'s messages on one side and mine on the other, oldest first', () => {
    conversations = [conv('c1', { unread_count: 1 })];
    thread = {
      data: [
        message('m2', { sender_id: 'me', body: 'پنج میلیون است', created_at: '2026-10-28T10:05:00Z' }),
        message('m1', { body: 'قیمت آخر؟', created_at: '2026-10-28T10:00:00Z' }),
      ],
      next_cursor: null,
    };
    post.mockResolvedValue({});
    mount();
    fireEvent.click(screen.getByTestId('chat-row'));
    const bubbles = screen.getAllByTestId('chat-bubble');
    expect(bubbles.map((b) => b.textContent)).toEqual([expect.stringContaining('قیمت آخر؟'), expect.stringContaining('پنج میلیون است')]);
    expect(bubbles[0]!.getAttribute('data-mine')).toBeNull();
    expect(bubbles[1]!.getAttribute('data-mine')).toBe('true');
    // opening it reads it
    return waitFor(() => expect(post).toHaveBeenCalledWith('chat/conversations/c1/read'));
  });

  it('sends the typed text (Enter sends, Shift+Enter does not) and clears the box', async () => {
    conversations = [conv('c1')];
    thread = { data: [message('m1')], next_cursor: null };
    post.mockResolvedValue(message('new', { sender_id: 'me' }));
    mount();
    fireEvent.click(screen.getByTestId('chat-row'));
    const box = screen.getByLabelText(t('chat.placeholder')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'سلام، بفرمایید' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(post).not.toHaveBeenCalledWith('chat/conversations/c1/messages', expect.anything());
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(post).toHaveBeenCalledWith('chat/conversations/c1/messages', expect.objectContaining({ type: 'TEXT', body: 'سلام، بفرمایید', client_id: expect.stringMatching(/^[0-9a-f-]{36}$/) })));
    await waitFor(() => expect(box.value).toBe(''));
  });

  it('keeps the text in the box when it could not be sent', async () => {
    conversations = [conv('c1')];
    thread = { data: [], next_cursor: null };
    post.mockImplementation(async (path: string) => {
      if (path.endsWith('/read')) return { marked: 0 };
      throw new Error('offline');
    });
    mount();
    fireEvent.click(screen.getByTestId('chat-row'));
    const box = screen.getByLabelText(t('chat.placeholder')) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'متن من' } });
    fireEvent.click(screen.getByRole('button', { name: t('chat.sendAria') }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(box.value).toBe('متن من');
  });

  it('loads older messages on request', async () => {
    conversations = [conv('c1')];
    thread = { data: [message('m9', { created_at: '2026-10-28T10:00:00Z' })], next_cursor: 'cursor-cursor-cursor-1' };
    get.mockResolvedValue({ data: [message('m1', { body: 'پیام قدیمی', created_at: '2026-10-20T10:00:00Z' })], next_cursor: null });
    mount();
    fireEvent.click(screen.getByTestId('chat-row'));
    fireEvent.click(screen.getByRole('button', { name: t('chat.older') }));
    await waitFor(() => expect(screen.getAllByTestId('chat-bubble')).toHaveLength(2));
    expect(get.mock.calls[0]![0]).toContain('before=cursor-cursor-cursor-1');
    expect(screen.getAllByTestId('chat-bubble')[0]!.textContent).toContain('پیام قدیمی');
    expect(screen.queryByRole('button', { name: t('chat.older') })).toBeNull();
  });

  it('shows a picture through the panel\'s proxy and a location as a link', () => {
    conversations = [conv('c1')];
    thread = {
      data: [
        message('m2', { type: 'LOCATION', body: null, lat: 34.5, lng: 69.1 }),
        message('m1', { type: 'IMAGE', body: null, image_url: '/chat/images/abc' }),
      ],
      next_cursor: null,
    };
    mount();
    fireEvent.click(screen.getByTestId('chat-row'));
    const panel = screen.getByRole('region', { name: t('chat.thread') });
    expect(within(panel).getByAltText(t('chat.image')).getAttribute('src')).toBe('/api/bongah/chat/images/abc');
    expect(within(panel).getByRole('link', { name: t('chat.openMap') }).getAttribute('href')).toContain('mlat=34.5');
  });
});
