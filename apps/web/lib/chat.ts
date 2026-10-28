import type { ChatConversation, ChatMessage, ChatMessagesPage } from '@bongah/shared-types';
import { api } from '@/lib/api';

/** Which conversations the inbox shows: all of them, the customers asking about my listings, or the ones I started. */
export type ChatFilter = 'ALL' | 'CUSTOMERS' | 'MINE';
export const CHAT_FILTERS: readonly ChatFilter[] = ['ALL', 'CUSTOMERS', 'MINE'];

/** A customer is someone who wrote to me about one of my listings (I am the SELLER of the conversation). */
export function inFilter(c: ChatConversation, filter: ChatFilter): boolean {
  if (filter === 'CUSTOMERS') return c.my_role === 'SELLER';
  if (filter === 'MINE') return c.my_role === 'BUYER';
  return true;
}

/** Matches the person's name, the listing's title or its place, ignoring case and the Arabic/Persian letter variants. */
export function matchesQuery(c: ChatConversation, query: string): boolean {
  const q = normalise(query);
  if (!q) return true;
  return normalise([c.counterpart.name, c.property.title, c.property.district, c.property.province].filter(Boolean).join(' ')).includes(q);
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌\s]+/g, ' ')
    .trim();

/** Conversations with something unread first, then the most recent. */
export function sortConversations(list: readonly ChatConversation[]): ChatConversation[] {
  const time = (c: ChatConversation) => new Date(c.last_message_at ?? c.created_at).getTime();
  return [...list].sort((a, b) => time(b) - time(a));
}

export const unreadTotal = (list: readonly ChatConversation[] | undefined) => (list ?? []).reduce((n, c) => n + c.unread_count, 0);

/** The API sends the newest message first; a thread reads oldest to newest. Older pages are merged by id. */
export function threadOrder(...pages: readonly (readonly ChatMessage[])[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const page of pages) for (const m of page) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id));
}

export const threadKey = (id: string) => `chat/conversations/${id}/messages?limit=30`;

export function fetchOlder(id: string, before: string): Promise<ChatMessagesPage> {
  return api.get<ChatMessagesPage>(`chat/conversations/${id}/messages?limit=30&before=${encodeURIComponent(before)}`);
}

export function sendText(id: string, body: string, clientId: string = crypto.randomUUID()): Promise<ChatMessage> {
  return api.post<ChatMessage>(`chat/conversations/${id}/messages`, { type: 'TEXT', client_id: clientId, body });
}

export function markRead(id: string): Promise<{ marked: number }> {
  return api.post<{ marked: number }>(`chat/conversations/${id}/read`);
}

/** A picture in a message is behind the API's login, so it is fetched through the panel's own proxy. */
export const chatImageSrc = (imageUrl: string) => `/api/bongah/${imageUrl.replace(/^\/+/, '')}`;

export const osmLink = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
