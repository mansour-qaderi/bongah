import { HttpException, Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { CHAT_EVENTS, type ChatSendAck, type ChatTypingEvent } from '@bongah/shared-types';
import {
  readConversationSchema,
  socketSendMessageSchema,
  typingSchema,
} from '@bongah/validation';
import type { JwtPayload } from '../auth/auth.types.js';
import { ChatEventsBus, type ChatEvent } from './chat.events.js';
import { ChatService } from './chat.service.js';

/** A typing "started" signal is passed on at most this often per person and conversation. */
const TYPING_MIN_INTERVAL_MS = 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;

interface SocketIdentity {
  userId: string;
  /** When the access token behind this connection expires (ms since epoch), or null if it has no expiry. */
  expiresAt: number | null;
}

type ChatSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, { identity?: SocketIdentity; typingAt?: Map<string, number> }>;

type ChatFailure = Extract<ChatSendAck, { ok: false }>;
const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: 'Please sign in again.', status: 401 } as const;

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Real-time chat over Socket.io.
 *
 *  - Connect with `auth: { token: <access token> }`. A bad or missing token is refused at the handshake.
 *  - Every connection joins its person's own room, so a message reaches all of that person's
 *    devices, and a person only ever receives events about conversations they are in.
 *  - Client -> server: `message:send` (answered with an acknowledgement), `typing`, `message:read`.
 *  - Server -> client: `message:new`, `typing`, `message:read`.
 *
 * All the rules (who may send what, rate limits, perks) live in ChatService, which the REST
 * endpoints use too. This class only authenticates, validates the payloads, and pushes events.
 */
@WebSocketGateway()
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(ChatGateway.name);
  private subscription: Subscription | null = null;

  @WebSocketServer() private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly chat: ChatService,
    private readonly bus: ChatEventsBus,
  ) {}

  afterInit(server: Server): void {
    server.use((socket: ChatSocket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('UNAUTHORIZED')),
      );
    });
    this.subscription = this.bus.events$.subscribe((event) => this.push(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  handleConnection(socket: ChatSocket): void {
    const identity = socket.data.identity;
    if (!identity) return;
    void socket.join(userRoom(identity.userId));

    // A connection must not outlive the access token it was opened with. Closing it at expiry
    // (rather than in the middle of a request) lets the app see a clean disconnect, sign in again
    // and reconnect. Capped because setTimeout cannot wait longer than ~24 days.
    if (identity.expiresAt !== null) {
      const timer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(identity.expiresAt - Date.now(), 0), MAX_TIMER_MS));
      timer.unref();
      socket.once('disconnect', () => clearTimeout(timer));
    }
  }

  @SubscribeMessage(CHAT_EVENTS.send)
  async onSend(@ConnectedSocket() socket: ChatSocket, @MessageBody() body: unknown): Promise<ChatSendAck> {
    const identity = this.identify(socket);
    if (!identity) return { ok: false, ...UNAUTHORIZED };

    const parsed = socketSendMessageSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid message.', status: 400 };

    try {
      const message = await this.chat.sendMessage(identity.userId, parsed.data.conversation_id, parsed.data.message);
      return { ok: true, message };
    } catch (error) {
      return this.failure(error);
    }
  }

  @SubscribeMessage(CHAT_EVENTS.typing)
  async onTyping(@ConnectedSocket() socket: ChatSocket, @MessageBody() body: unknown): Promise<void> {
    const identity = this.identify(socket);
    const parsed = typingSchema.safeParse(body);
    if (!identity || !parsed.success) return;
    const { conversation_id, is_typing } = parsed.data;

    // Typing is chatty: pass "started" on at most once a second. "Stopped" always goes through.
    const typingAt = (socket.data.typingAt ??= new Map<string, number>());
    const now = Date.now();
    if (is_typing && now - (typingAt.get(conversation_id) ?? 0) < TYPING_MIN_INTERVAL_MS) return;
    typingAt.set(conversation_id, now);

    try {
      const pair = await this.chat.participantsOf(identity.userId, conversation_id);
      const other = pair?.find((id) => id !== identity.userId);
      if (!other) return;
      const event: ChatTypingEvent = { conversation_id, user_id: identity.userId, is_typing };
      this.server.to(userRoom(other)).emit(CHAT_EVENTS.typing, event);
    } catch (error) {
      this.logger.warn(`typing event failed: ${String(error)}`);
    }
  }

  @SubscribeMessage(CHAT_EVENTS.read)
  async onRead(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: true; marked: number } | ChatFailure> {
    const identity = this.identify(socket);
    if (!identity) return { ok: false, ...UNAUTHORIZED };
    const parsed = readConversationSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid request.', status: 400 };

    try {
      const { marked } = await this.chat.markRead(identity.userId, parsed.data.conversation_id);
      return { ok: true, marked };
    } catch (error) {
      return this.failure(error);
    }
  }

  // ───────────── internals ─────────────

  private async authenticate(socket: ChatSocket): Promise<void> {
    const auth: unknown = socket.handshake.auth;
    const token = typeof auth === 'object' && auth !== null ? (auth as { token?: unknown }).token : undefined;
    if (typeof token !== 'string' || token === '') throw new Error('no token');

    const payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(token);
    socket.data.identity = {
      userId: payload.sub,
      expiresAt: payload.exp ? payload.exp * 1000 : null,
    };
  }

  /**
   * The person behind this connection, or null once their token has expired. (The connection
   * itself is closed by the timer in handleConnection; this covers the moments in between.)
   */
  private identify(socket: ChatSocket): SocketIdentity | null {
    const identity = socket.data.identity;
    if (!identity) return null;
    return identity.expiresAt !== null && identity.expiresAt <= Date.now() ? null : identity;
  }

  private push(event: ChatEvent): void {
    const rooms = [...new Set(event.participantIds)].map(userRoom);
    if (event.kind === 'message') this.server.to(rooms).emit(CHAT_EVENTS.newMessage, event.message);
    else this.server.to(rooms).emit(CHAT_EVENTS.read, event.event);
  }

  /** The same answer HTTP would have given: the error's code, message and status. */
  private failure(error: unknown): ChatFailure {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const body =
        typeof response === 'string'
          ? { message: response }
          : (response as { message?: unknown; code?: unknown; retry_after?: unknown });
      return {
        ok: false,
        code: typeof body.code === 'string' ? body.code : String(error.getStatus()),
        message: typeof body.message === 'string' ? body.message : error.message,
        status: error.getStatus(),
        ...(typeof body.retry_after === 'number' ? { retry_after: body.retry_after } : {}),
      };
    }
    this.logger.error(`Unexpected chat error: ${String(error)}`);
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Something went wrong.', status: 500 };
  }
}
