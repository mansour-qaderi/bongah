import type { InfiniteData } from '@tanstack/react-query';
import type { ChatMessage, ChatMessagesPage } from '@bongah/shared-types';

/** A conversation's history as React Query holds it: pages of messages, newest first, newest page first. */
export type MessagesData = InfiniteData<ChatMessagesPage, string | undefined>;

/**
 * Puts a message at the top of a conversation's cached history, unless it is already there (a
 * message can arrive both by socket and in a fetched page). Returns the same object when nothing
 * changed. Leaves an unloaded history alone: its first fetch will include the message.
 */
export function insertMessage(
  data: MessagesData | undefined,
  message: ChatMessage,
): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data;
  if (data.pages.some(page => page.data.some(m => m.id === message.id))) {
    return data;
  }
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [{ ...first, data: [message, ...first.data] }, ...rest],
  };
}

/** The other person read the conversation: everything not sent by them is now read. */
export function markReadBy(
  data: MessagesData | undefined,
  readerId: string,
  readAt: string,
): MessagesData | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map(page => ({
    ...page,
    data: page.data.map(message => {
      if (message.sender_id === readerId || message.read_at !== null) {
        return message;
      }
      changed = true;
      return { ...message, read_at: readAt };
    }),
  }));
  return changed ? { ...data, pages } : data;
}

/** Every message of a cached history, newest first. */
export const allMessages = (data: MessagesData | undefined): ChatMessage[] =>
  data?.pages.flatMap(page => page.data) ?? [];
