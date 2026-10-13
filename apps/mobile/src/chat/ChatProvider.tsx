import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import {
  CHAT_EVENTS,
  type ChatMessage,
  type ChatReadEvent,
  type ChatSendAck,
  type ChatTypingEvent,
} from '@bongah/shared-types';
import type { SendMessageInput } from '@bongah/validation';
import { ApiError, getAuthToken } from '../api/client';
import { sendMessageHttp } from '../api/endpoints';
import { queryKeys } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import {
  API_BASE_URL,
  SOCKET_ACK_TIMEOUT_MS,
  TYPING_VISIBLE_MS,
} from '../config';
import { insertMessage, markReadBy, type MessagesData } from './messageCache';

interface ChatContextValue {
  /** The live connection is up. Chat still works without it (over HTTP), just not instantly. */
  connected: boolean;
  /** Which conversations the other person is typing in right now. */
  typing: Record<string, boolean>;
  /**
   * Sends a message and resolves with the stored copy. Uses the socket when it is up and falls
   * back to HTTP when it is not, or when the socket does not answer: the message carries its own
   * client_id, so a message that did arrive is never stored twice.
   */
  send: (
    conversationId: string,
    message: SendMessageInput,
  ) => Promise<ChatMessage>;
  /** Tells the other person I started / stopped typing. Does nothing while offline. */
  setTyping: (conversationId: string, isTyping: boolean) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Keeps one Socket.io connection open while someone is signed in and turns what the server pushes
 * into React Query cache updates, so every screen simply reads the cache: new messages, read
 * receipts and "typing…" appear without refreshing.
 *
 * It needs <AuthProvider> and <QueryClientProvider> above it.
 */
export function ChatProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { status, user } = useAuth();
  const userId = user?.id ?? null;

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTypingState] = useState<Record<string, boolean>>({});
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const putMessage = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<MessagesData>(
        queryKeys.messages(message.conversation_id),
        old => insertMessage(old, message),
      );
      // The list shows the newest message and the unread count.
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    [queryClient],
  );

  useEffect(() => {
    if (status !== 'signedIn' || !userId) return;
    const timers = typingTimers.current;

    const socket = io(API_BASE_URL, {
      transports: ['websocket'],
      // A function, so every reconnect sends the token as it is NOW.
      auth: (done: (data: object) => void) =>
        done({ token: getAuthToken() ?? '' }),
      reconnectionDelayMax: 15_000,
    });
    socketRef.current = socket;

    const stopTyping = (conversationId: string) => {
      clearTimeout(timers.get(conversationId));
      timers.delete(conversationId);
      setTypingState(current =>
        current[conversationId]
          ? { ...current, [conversationId]: false }
          : current,
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      // Anything sent while the connection was down did not reach us as an event.
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error: Error) => {
      // A refused token will be refused again: stop. The next signed-in request that gets a 401
      // ends the session, and signing in again creates a fresh connection.
      if (error.message === 'UNAUTHORIZED') socket.disconnect();
    });

    socket.on(CHAT_EVENTS.newMessage, (message: ChatMessage) => {
      putMessage(message);
      if (message.sender_id !== userId) stopTyping(message.conversation_id);
    });

    socket.on(CHAT_EVENTS.read, (event: ChatReadEvent) => {
      if (event.reader_id === userId) {
        // I read it on another device: my unread count changed.
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        return;
      }
      queryClient.setQueryData<MessagesData>(
        queryKeys.messages(event.conversation_id),
        old => markReadBy(old, event.reader_id, event.read_at),
      );
    });

    socket.on(CHAT_EVENTS.typing, (event: ChatTypingEvent) => {
      if (event.user_id === userId) return;
      if (!event.is_typing) {
        stopTyping(event.conversation_id);
        return;
      }
      setTypingState(current => ({
        ...current,
        [event.conversation_id]: true,
      }));
      // If the "stopped" signal is lost, don't show "typing…" forever.
      clearTimeout(timers.get(event.conversation_id));
      timers.set(
        event.conversation_id,
        setTimeout(() => stopTyping(event.conversation_id), TYPING_VISIBLE_MS),
      );
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      timers.forEach(clearTimeout);
      timers.clear();
      setConnected(false);
      setTypingState({});
    };
  }, [status, userId, queryClient, putMessage]);

  const send = useCallback(
    async (conversationId: string, message: SendMessageInput) => {
      const socket = socketRef.current;
      if (socket?.connected) {
        try {
          const ack = (await socket
            .timeout(SOCKET_ACK_TIMEOUT_MS)
            .emitWithAck(CHAT_EVENTS.send, {
              conversation_id: conversationId,
              message,
            })) as ChatSendAck;
          if (ack.ok) {
            putMessage(ack.message);
            return ack.message;
          }
          // The server answered "no": that is the answer, not a reason to try again.
          throw new ApiError('http', ack.status, {
            code: ack.code,
            message: ack.message,
            ...(ack.retry_after ? { retry_after: ack.retry_after } : {}),
          });
        } catch (error) {
          if (error instanceof ApiError) throw error;
          // No answer (timed out, or the connection dropped mid-send): the message may or may not
          // have arrived. Send it again over HTTP; the same client_id makes that safe.
        }
      }
      const stored = await sendMessageHttp(conversationId, message);
      putMessage(stored);
      return stored;
    },
    [putMessage],
  );

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(CHAT_EVENTS.typing, {
      conversation_id: conversationId,
      is_typing: isTyping,
    });
  }, []);

  const value = useMemo(
    () => ({ connected, typing, send, setTyping }),
    [connected, typing, send, setTyping],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside <ChatProvider>');
  return value;
}
