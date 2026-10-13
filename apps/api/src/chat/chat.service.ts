import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AFGHANISTAN_BOUNDS,
  CHAT_MAX_TEMPLATES,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_TEMPLATE_MAX_LENGTH,
  type ChatCapabilities,
  type ChatConversation,
  type ChatMessage,
  type ChatMessagesPage,
} from '@bongah/shared-types';
import type { MessageHistoryQuery, SendMessageInput } from '@bongah/validation';
import {
  MessageType,
  Prisma,
  PropertyStatus,
  type Message as MessageRow,
} from '../generated/prisma/client.js';
import { accountPerkReason } from '../perks/perks.access.js';
import { PERKS_REQUIRED_CODE } from '../perks/perks.guard.js';
import { PerksService } from '../perks/perks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CHAT_SETTINGS, type ChatSettings } from './chat.config.js';
import { ChatEventsBus } from './chat.events.js';
import { decodeCursor, encodeCursor, toChatMessage } from './chat.mapper.js';
import { SlidingWindowLimiter } from './chat.rate-limit.js';

const MAX_LISTED_CONVERSATIONS = 100;
const PARTICIPANT_CACHE_LIMIT = 5000;

/** What the service needs to know about a conversation to authorise anything on it. */
interface ConversationAccess {
  id: string;
  buyerId: string;
  sellerId: string;
  propertyStatus: PropertyStatus;
}

const conversationInclude = {
  property: {
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      province: true,
      district: true,
      status: true,
      images: true,
    },
  },
  buyer: { select: { id: true, fullName: true } },
  seller: { select: { id: true, fullName: true } },
  agency: { select: { agencyName: true } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

@Injectable()
export class ChatService {
  private readonly limiter: SlidingWindowLimiter;
  /** conversation id -> [buyer, seller]. A conversation's two people never change, so this never goes stale. */
  private readonly participants = new Map<string, [string, string]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly perks: PerksService,
    private readonly bus: ChatEventsBus,
    @Inject(CHAT_SETTINGS) private readonly settings: ChatSettings,
  ) {
    this.limiter = new SlidingWindowLimiter(settings.messagesPerMinute, 60_000);
  }

  /** What the signed-in user's chat can do: the agency perks and the size limits that follow from them. */
  async getCapabilities(userId: string): Promise<ChatCapabilities> {
    const reason = await this.perks.reasonFor(userId);
    return {
      advanced: reason !== null,
      advanced_reason: reason,
      limits: {
        text_max_length: CHAT_MESSAGE_MAX_LENGTH,
        image_max_bytes: reason ? this.settings.imageMaxBytesAdvanced : this.settings.imageMaxBytes,
        template_max_length: CHAT_TEMPLATE_MAX_LENGTH,
        templates_max: CHAT_MAX_TEMPLATES,
      },
    };
  }

  /**
   * Opens (or reopens) the chat between the signed-in user and the owner of a listing. One chat
   * per (listing, person asking): tapping "Chat in App" twice gives the same conversation. It
   * stays out of both people's lists until the first message is sent.
   */
  async openConversation(buyerId: string, propertyId: string): Promise<ChatConversation> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, status: { not: PropertyStatus.ARCHIVED } },
      select: { id: true, userId: true, agencyId: true },
    });
    if (!property) throw new NotFoundException('Property not found.');
    if (property.userId === buyerId) {
      throw new ConflictException({
        message: 'You cannot start a chat about your own listing.',
        code: 'CANNOT_CHAT_WITH_SELF',
      });
    }

    const where = { propertyId_buyerId: { propertyId, buyerId } };
    let existing = await this.prisma.conversation.findUnique({ where, select: { id: true } });
    if (!existing) {
      try {
        existing = await this.prisma.conversation.create({
          data: { propertyId, buyerId, sellerId: property.userId, agencyId: property.agencyId },
          select: { id: true },
        });
      } catch (error) {
        // Two taps at once: the other request created it first.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        existing = await this.prisma.conversation.findUniqueOrThrow({ where, select: { id: true } });
      }
    }
    return (await this.listFor(buyerId, { conversationId: existing.id }))[0];
  }

  /** The signed-in user's conversations (as buyer or seller) that have at least one message, newest first. */
  listConversations(userId: string): Promise<ChatConversation[]> {
    return this.listFor(userId, {});
  }

  /** One page of a conversation's messages, newest first. */
  async getMessages(userId: string, conversationId: string, query: MessageHistoryQuery): Promise<ChatMessagesPage> {
    await this.requireParticipant(userId, conversationId);

    let cursorFilter: Prisma.MessageWhereInput = {};
    if (query.before) {
      const cursor = decodeCursor(query.before);
      if (!cursor) throw new BadRequestException({ message: 'Invalid cursor.', code: 'INVALID_CURSOR' });
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }

    // One extra row tells us whether there is an older page, without a COUNT.
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...cursorFilter },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map(toChatMessage),
      next_cursor: rows.length > query.limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  /**
   * Sends a message, from REST or a socket (both come here, so they obey the same rules).
   *
   *  - Safe to repeat: the same `client_id` from the same sender returns the stored message
   *    instead of a duplicate, and does not count against the rate limit.
   *  - Map pins need the agency perks (403 PERKS_REQUIRED) and must be inside Afghanistan.
   *  - A picture must have been uploaded by the sender, and can be sent once.
   *  - Nothing can be sent about an archived listing (409 LISTING_NOT_ACTIVE).
   *  - The first message from a buyer to an agency with the perks and an automatic reply is
   *    answered with it, once.
   */
  async sendMessage(senderId: string, conversationId: string, input: SendMessageInput): Promise<ChatMessage> {
    const conversation = await this.requireParticipant(senderId, conversationId);

    const already = await this.findByClientId(conversationId, senderId, input.client_id);
    if (already) return toChatMessage(already);

    if (!this.limiter.tryAcquire(senderId)) {
      throw new HttpException(
        {
          message: 'You are sending messages too fast.',
          code: 'CHAT_RATE_LIMITED',
          retry_after: this.limiter.retryAfterSeconds(senderId),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (conversation.propertyStatus === PropertyStatus.ARCHIVED) {
      throw new ConflictException({
        message: 'This listing is no longer available.',
        code: 'LISTING_NOT_ACTIVE',
      });
    }

    const data = await this.prepareMessage(senderId, conversationId, input);

    let stored: { message: MessageRow; autoReply: MessageRow | null };
    try {
      stored = await this.prisma.$transaction(async (db) => {
        const message = await db.message.create({ data });

        // The UPDATE only matches an empty conversation, so exactly one message is "the first",
        // even when two arrive at once.
        const first = await db.$queryRaw<{ id: string }[]>`
          UPDATE conversations SET last_message_at = ${message.createdAt}
           WHERE id = ${conversationId}::uuid AND last_message_at IS NULL
          RETURNING id`;
        if (first.length === 0) {
          await db.$executeRaw`
            UPDATE conversations SET last_message_at = GREATEST(last_message_at, ${message.createdAt})
             WHERE id = ${conversationId}::uuid`;
        }

        const autoReply =
          first.length === 1 && senderId === conversation.buyerId
            ? await this.createAutoReply(db, conversation, message.createdAt)
            : null;
        return { message, autoReply };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // The same message arrived twice at once: the other one won. Return it.
        const winner = await this.findByClientId(conversationId, senderId, input.client_id);
        if (winner) return toChatMessage(winner);
        throw new ConflictException({ message: 'This picture was already sent.', code: 'IMAGE_ALREADY_SENT' });
      }
      throw error;
    }

    const participantIds: [string, string] = [conversation.buyerId, conversation.sellerId];
    this.bus.publish({ kind: 'message', participantIds, message: toChatMessage(stored.message) });
    if (stored.autoReply) {
      this.bus.publish({ kind: 'message', participantIds, message: toChatMessage(stored.autoReply) });
    }
    return toChatMessage(stored.message);
  }

  /**
   * Marks everything the other person sent in this conversation as read, and tells them.
   * Returns how many messages were newly marked.
   */
  async markRead(userId: string, conversationId: string): Promise<{ marked: number }> {
    const conversation = await this.requireParticipant(userId, conversationId);
    const readAt = new Date();
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt },
    });
    if (count > 0) {
      this.bus.publish({
        kind: 'read',
        participantIds: [conversation.buyerId, conversation.sellerId],
        event: { conversation_id: conversationId, reader_id: userId, read_at: readAt.toISOString() },
      });
    }
    return { marked: count };
  }

  /**
   * The two people in a conversation, or null when `userId` is not one of them. For the socket
   * gateway's typing events, which must not reach anyone outside the conversation. Cached: the
   * two people of a conversation never change.
   */
  async participantsOf(userId: string, conversationId: string): Promise<[string, string] | null> {
    let pair = this.participants.get(conversationId);
    if (!pair) {
      const row = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { buyerId: true, sellerId: true },
      });
      if (!row) return null;
      pair = [row.buyerId, row.sellerId];
      if (this.participants.size >= PARTICIPANT_CACHE_LIMIT) this.participants.clear();
      this.participants.set(conversationId, pair);
    }
    return pair.includes(userId) ? pair : null;
  }

  // ───────────── internals ─────────────

  /** Someone else's conversation looks exactly like a missing one. */
  private async requireParticipant(userId: string, conversationId: string): Promise<ConversationAccess> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, buyerId: true, sellerId: true, property: { select: { status: true } } },
    });
    if (!row || (row.buyerId !== userId && row.sellerId !== userId)) {
      throw new NotFoundException('Conversation not found.');
    }
    return { id: row.id, buyerId: row.buyerId, sellerId: row.sellerId, propertyStatus: row.property.status };
  }

  private findByClientId(conversationId: string, senderId: string, clientId: string) {
    return this.prisma.message.findUnique({
      where: { conversationId_senderId_clientId: { conversationId, senderId, clientId } },
    });
  }

  /** Checks what the message needs (perks, picture, pin) and turns it into row data. */
  private async prepareMessage(
    senderId: string,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<Prisma.MessageUncheckedCreateInput> {
    const base = { conversationId, senderId, clientId: input.client_id };

    switch (input.type) {
      case 'TEXT':
        return { ...base, type: MessageType.TEXT, body: input.body };

      case 'IMAGE': {
        const image = await this.prisma.chatImage.findUnique({
          where: { id: input.image_id },
          select: { id: true, uploaderId: true, message: { select: { id: true } } },
        });
        // Someone else's picture looks like a missing one: ids are not secrets between users.
        if (!image || image.uploaderId !== senderId) {
          throw new BadRequestException({ message: 'Picture not found.', code: 'IMAGE_NOT_FOUND' });
        }
        if (image.message) {
          throw new ConflictException({ message: 'This picture was already sent.', code: 'IMAGE_ALREADY_SENT' });
        }
        return { ...base, type: MessageType.IMAGE, imageId: image.id, body: input.body ?? null };
      }

      case 'LOCATION': {
        if (!(await this.perks.reasonFor(senderId))) {
          throw new ForbiddenException({
            message: 'Sending a map location needs an active agency subscription.',
            code: PERKS_REQUIRED_CODE,
          });
        }
        const { minLat, maxLat, minLng, maxLng } = AFGHANISTAN_BOUNDS;
        if (input.lat < minLat || input.lat > maxLat || input.lng < minLng || input.lng > maxLng) {
          throw new BadRequestException({
            message: 'The location must be inside Afghanistan.',
            code: 'LOCATION_OUT_OF_BOUNDS',
          });
        }
        return { ...base, type: MessageType.LOCATION, lat: input.lat, lng: input.lng, body: input.body ?? null };
      }
    }
  }

  /**
   * Answers a buyer's first message with the seller's automatic reply, if the seller has the
   * agency perks and has set one. `auto_reply_sent_at` is claimed with a conditional UPDATE, so
   * even if this ran twice only one reply could ever be created. Runs in the same transaction as
   * the buyer's message: both exist or neither does.
   */
  private async createAutoReply(
    db: Prisma.TransactionClient,
    conversation: ConversationAccess,
    after: Date,
  ): Promise<MessageRow | null> {
    const seller = await db.user.findUnique({ where: { id: conversation.sellerId }, select: { role: true } });
    if (!seller || !(await accountPerkReason(db, conversation.sellerId, seller.role, after))) return null;

    const template = await db.chatTemplate.findFirst({
      where: { userId: conversation.sellerId, isAutoReply: true },
      select: { body: true },
    });
    if (!template) return null;

    const claimed = await db.$queryRaw<{ id: string }[]>`
      UPDATE conversations SET auto_reply_sent_at = ${after}
       WHERE id = ${conversation.id}::uuid AND auto_reply_sent_at IS NULL
      RETURNING id`;
    if (claimed.length === 0) return null;

    // One millisecond later, so the reply always sorts after the message it answers.
    const repliedAt = new Date(after.getTime() + 1);
    const reply = await db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: conversation.sellerId,
        type: MessageType.TEXT,
        body: template.body,
        isAutoReply: true,
        clientId: randomUUID(),
        createdAt: repliedAt,
      },
    });
    await db.$executeRaw`
      UPDATE conversations SET last_message_at = ${repliedAt} WHERE id = ${conversation.id}::uuid`;
    return reply;
  }

  private async listFor(
    userId: string,
    filter: { conversationId?: string },
  ): Promise<ChatConversation[]> {
    const rows = await this.prisma.conversation.findMany({
      where: filter.conversationId
        ? { id: filter.conversationId }
        : { OR: [{ buyerId: userId }, { sellerId: userId }], lastMessageAt: { not: null } },
      include: {
        ...conversationInclude,
        messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: MAX_LISTED_CONVERSATIONS,
    });
    if (rows.length === 0) return [];

    const unread = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: rows.map((row) => row.id) },
        senderId: { not: userId },
        readAt: null,
      },
      _count: { _all: true },
    });
    const unreadBy = new Map(unread.map((row) => [row.conversationId, row._count._all]));

    return rows.map((row) => this.toConversation(row, row.messages[0] ?? null, userId, unreadBy.get(row.id) ?? 0));
  }

  private toConversation(
    row: ConversationRow,
    last: MessageRow | null,
    userId: string,
    unread: number,
  ): ChatConversation {
    const asBuyer = row.buyerId === userId;
    const other = asBuyer ? row.seller : row.buyer;
    return {
      id: row.id,
      property: {
        id: row.property.id,
        title: row.property.title,
        price: row.property.price.toNumber(),
        currency: row.property.currency,
        province: row.property.province,
        district: row.property.district,
        status: row.property.status,
        cover_image: row.property.images[0] ?? null,
      },
      counterpart: {
        id: other.id,
        // An agency listing is answered by the agency, so the buyer sees its name.
        name: asBuyer ? (row.agency?.agencyName ?? other.fullName) : other.fullName,
      },
      my_role: asBuyer ? 'BUYER' : 'SELLER',
      last_message: last ? toChatMessage(last) : null,
      unread_count: unread,
      last_message_at: row.lastMessageAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
