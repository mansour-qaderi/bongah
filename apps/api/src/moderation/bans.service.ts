import { ConflictException, Injectable } from '@nestjs/common';
import { ChatEventsBus } from '../chat/chat.events.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { banUser, unbanUser } from './moderation.actions.js';

@Injectable()
export class BansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: ChatEventsBus,
  ) {}

  /** Bans the account (409 ALREADY_BANNED if it is) and cuts its live chat connections. */
  async ban(actorId: string, userId: string, reason: string): Promise<void> {
    const banned = await this.prisma.$transaction((db) => banUser(db, actorId, userId, reason, new Date()));
    if (!banned) throw new ConflictException({ message: 'This account is already banned.', code: 'ALREADY_BANNED' });
    this.disconnect(userId);
  }

  async unban(actorId: string, userId: string): Promise<void> {
    const lifted = await this.prisma.$transaction((db) => unbanUser(db, actorId, userId));
    if (!lifted) throw new ConflictException({ message: 'This account is not banned.', code: 'NOT_BANNED' });
  }

  /**
   * Closes the person's chat sockets. Called AFTER the ban has committed: from then on a reconnect is
   * refused at the handshake, so nothing can slip in between. (The bus is in-process: with several
   * server instances this needs the same Redis pub/sub the chat itself would need.)
   */
  disconnect(userId: string): void {
    this.bus.publish({ kind: 'disconnect', userId });
  }
}
