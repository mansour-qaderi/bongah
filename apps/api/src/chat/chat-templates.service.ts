import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CHAT_MAX_TEMPLATES, type ChatTemplate } from '@bongah/shared-types';
import type { CreateTemplateInput, UpdateTemplateInput } from '@bongah/validation';
import { Prisma, type ChatTemplate as TemplateRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function toTemplate(row: TemplateRow): ChatTemplate {
  return {
    id: row.id,
    body: row.body,
    is_auto_reply: row.isAutoReply,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * An agency's saved replies. Who may use them (the agency perks) is checked by PerksGuard on the
 * routes; this class only keeps each person's own list consistent: at most CHAT_MAX_TEMPLATES, and
 * at most one automatic reply (the database enforces that last rule too).
 */
@Injectable()
export class ChatTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ChatTemplate[]> {
    const rows = await this.prisma.chatTemplate.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toTemplate);
  }

  async create(userId: string, input: CreateTemplateInput): Promise<ChatTemplate> {
    return this.prisma.$transaction(async (db) => {
      await this.lockUser(db, userId);
      if ((await db.chatTemplate.count({ where: { userId } })) >= CHAT_MAX_TEMPLATES) {
        throw new ConflictException({
          message: `You can keep at most ${CHAT_MAX_TEMPLATES} saved replies.`,
          code: 'TEMPLATE_LIMIT_REACHED',
        });
      }
      if (input.is_auto_reply) await this.clearAutoReply(db, userId);
      const row = await db.chatTemplate.create({
        data: { userId, body: input.body, isAutoReply: input.is_auto_reply },
      });
      return toTemplate(row);
    });
  }

  async update(userId: string, id: string, input: UpdateTemplateInput): Promise<ChatTemplate> {
    return this.prisma.$transaction(async (db) => {
      await this.lockUser(db, userId);
      const existing = await db.chatTemplate.findFirst({ where: { id, userId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Saved reply not found.');
      if (input.is_auto_reply) await this.clearAutoReply(db, userId, id);
      const row = await db.chatTemplate.update({
        where: { id },
        data: { body: input.body, isAutoReply: input.is_auto_reply },
      });
      return toTemplate(row);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.chatTemplate.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Saved reply not found.');
  }

  /** Serialises one person's template changes, so the count limit and the one-auto-reply rule cannot be raced. */
  private async lockUser(db: Prisma.TransactionClient, userId: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
  }

  /** Turning one reply into the automatic one turns the previous one off. */
  private async clearAutoReply(db: Prisma.TransactionClient, userId: string, exceptId?: string): Promise<void> {
    await db.chatTemplate.updateMany({
      where: { userId, isAutoReply: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isAutoReply: false },
    });
  }
}
