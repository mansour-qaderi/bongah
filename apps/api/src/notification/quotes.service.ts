import { Injectable, NotFoundException } from '@nestjs/common';
import type { DailyQuote, Language, Paginated, WelcomeQuote } from '@bongah/shared-types';
import type { AdminQuotesQuery, CreateQuoteInput, UpdateQuoteInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { Prisma, QuoteCategory, type DailyQuote as QuoteRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const NO_ACTIVE_QUOTE_CODE = 'NO_ACTIVE_QUOTE';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A random active welcome quote in this language, for the first-launch card. No cross-language fallback:
   * the card is drawn in the app's language, so the app shows its own built-in text rather than a quote it
   * cannot be sure the user reads. 404 means exactly that: use the built-in text.
   */
  async randomWelcome(language: Language): Promise<WelcomeQuote> {
    const where: Prisma.DailyQuoteWhereInput = { category: QuoteCategory.WELCOME_ONBOARDING, language, isActive: true };
    const count = await this.prisma.dailyQuote.count({ where });
    if (count === 0) {
      throw new NotFoundException({ message: 'There is no welcome quote for this language.', code: NO_ACTIVE_QUOTE_CODE });
    }
    const [row] = await this.prisma.dailyQuote.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: Math.floor(Math.random() * count),
      take: 1,
    });
    // A quote deleted between the two queries leaves nothing at that offset: same answer as having none.
    if (!row) throw new NotFoundException({ message: 'There is no welcome quote for this language.', code: NO_ACTIVE_QUOTE_CODE });
    return { id: row.id, text: row.text, language: row.language as Language };
  }

  // ───────────── admin ─────────────

  async list(query: AdminQuotesQuery): Promise<Paginated<DailyQuote>> {
    const where: Prisma.DailyQuoteWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.is_active === undefined ? {} : { isActive: query.is_active }),
      ...(query.q ? { text: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dailyQuote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.dailyQuote.count({ where }),
    ]);
    return {
      data: rows.map(toQuote),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  async create(actorId: string, input: CreateQuoteInput): Promise<DailyQuote> {
    return this.prisma.$transaction(async (db) => {
      const row = await db.dailyQuote.create({
        data: { text: input.text, category: input.category, language: input.language, isActive: input.is_active },
      });
      await recordAudit(db, {
        actorId,
        action: 'QUOTE_CREATED',
        targetType: 'quote',
        targetId: row.id,
        metadata: { category: row.category, language: row.language },
      });
      return toQuote(row);
    });
  }

  async update(actorId: string, id: string, input: UpdateQuoteInput): Promise<DailyQuote> {
    return this.prisma.$transaction(async (db) => {
      const current = await db.dailyQuote.findUnique({ where: { id }, select: { id: true } });
      if (!current) throw new NotFoundException('Quote not found.');
      const row = await db.dailyQuote.update({
        where: { id },
        data: { text: input.text, category: input.category, language: input.language, isActive: input.is_active },
      });
      await recordAudit(db, {
        actorId,
        action: 'QUOTE_UPDATED',
        targetType: 'quote',
        targetId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toQuote(row);
    });
  }

  /** Deleting a quote keeps the history of pushes that used it (their quote link just becomes empty). */
  async remove(actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (db) => {
      const removed = await db.dailyQuote.deleteMany({ where: { id } });
      if (removed.count === 0) throw new NotFoundException('Quote not found.');
      await recordAudit(db, { actorId, action: 'QUOTE_DELETED', targetType: 'quote', targetId: id });
    });
  }
}

function toQuote(row: QuoteRow): DailyQuote {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    language: row.language as Language,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
