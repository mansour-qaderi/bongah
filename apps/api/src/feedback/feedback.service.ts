import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { FeedbackReceived, MyFeedbackItem } from '@bongah/shared-types';
import type { CreateFeedbackInput } from '@bongah/validation';
import { PrismaService } from '../prisma/prisma.service.js';

/** One person can send this many messages in a day: a brake on someone flooding the team's inbox. */
export const MAX_FEEDBACK_PER_DAY = 20;
/** How many of their own messages a person sees under the form. */
export const MY_FEEDBACK_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /** Keeps a suggestion, a problem report or a thank-you for the Bongah team. */
  async create(userId: string, input: CreateFeedbackInput): Promise<FeedbackReceived> {
    const recent = await this.prisma.feedback.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    });
    if (recent >= MAX_FEEDBACK_PER_DAY) {
      throw new HttpException(
        { message: 'You have sent a lot of messages today. Please try again tomorrow.', code: 'TOO_MUCH_FEEDBACK' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const row = await this.prisma.feedback.create({
      data: {
        userId,
        category: input.category,
        message: input.message,
        appVersion: input.app_version ?? null,
      },
      select: { id: true, createdAt: true },
    });
    return { id: row.id, created_at: row.createdAt.toISOString() };
  }

  /** The person's own messages, newest first, each with the team's answer when there is one. */
  async mine(userId: string): Promise<MyFeedbackItem[]> {
    const rows = await this.prisma.feedback.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MY_FEEDBACK_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      message: row.message,
      created_at: row.createdAt.toISOString(),
      reply: row.adminReply && row.repliedAt ? { message: row.adminReply, replied_at: row.repliedAt.toISOString() } : null,
    }));
  }
}
