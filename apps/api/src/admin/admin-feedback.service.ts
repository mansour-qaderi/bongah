import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AdminFeedbackItem, AdminFeedbackReplyResult, Language, Paginated } from '@bongah/shared-types';
import { normalizeAfghanMobile, type AdminFeedbackQuery, type AdminFeedbackReplyInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { adminPersonSelect, toAdminPerson } from '../common/admin-person.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  FEEDBACK_REPLY_PUSH_TYPE,
  FEEDBACK_REPLY_TITLE,
  FEEDBACK_REPLY_TTL_SECONDS,
} from '../notification/notification.messages.js';
import { PUSH_GATEWAY, type PushGateway } from '../notification/push.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A push shows the start of the answer; the whole of it is under the feedback form in the app. */
const PUSH_BODY_MAX = 180;

const feedbackInclude = { user: { select: adminPersonSelect } } satisfies Prisma.FeedbackInclude;
type FeedbackRow = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }>;

/** The inbox of the app's feedback form (suggestions, problems, thanks), read by an admin. */
@Injectable()
export class AdminFeedbackService {
  private readonly logger = new Logger(AdminFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_GATEWAY) private readonly push: PushGateway,
  ) {}

  /**
   * Answers one message. The answer is saved (and an earlier answer replaced, so a typo can be mended), the action is
   * written to the audit log in the same transaction, and then the person's phones are pushed. The push is the part that
   * may fail (no phone, provider down): the answer is kept and shown in the app regardless, and `notified` says which.
   */
  async reply(adminId: string, id: string, input: AdminFeedbackReplyInput): Promise<AdminFeedbackReplyResult> {
    const row = await this.prisma.$transaction(async (db) => {
      const found = await db.feedback.findUnique({ where: { id }, select: { id: true, userId: true } });
      if (!found) throw new NotFoundException({ message: 'Feedback not found', code: 'FEEDBACK_NOT_FOUND' });
      const updated = await db.feedback.update({
        where: { id },
        data: { adminReply: input.message, repliedAt: new Date(), repliedById: adminId },
        include: feedbackInclude,
      });
      await recordAudit(db, {
        actorId: adminId,
        action: 'FEEDBACK_REPLIED',
        targetType: 'feedback',
        targetId: id,
        metadata: { user_id: found.userId, length: input.message.length },
      });
      return updated;
    });
    const notified = await this.notify(row.userId, row.id, input.message);
    return { item: toItem(row), notified };
  }

  /** Pushes the person's phones; never throws. True when at least one phone took it. */
  private async notify(userId: string, feedbackId: string, message: string): Promise<boolean> {
    try {
      const devices = await this.prisma.pushDevice.findMany({
        where: { userId },
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }],
      });
      const dead: string[] = [];
      let delivered = false;
      for (const device of devices) {
        const language: Language = device.language === 'ps' ? 'ps' : 'prs';
        const result = await this.push.send({
          token: device.token,
          title: FEEDBACK_REPLY_TITLE[language],
          body: message.length > PUSH_BODY_MAX ? `${message.slice(0, PUSH_BODY_MAX - 1)}…` : message,
          data: { type: FEEDBACK_REPLY_PUSH_TYPE, feedback_id: feedbackId },
          ttlSeconds: FEEDBACK_REPLY_TTL_SECONDS,
        });
        if (result.ok) delivered = true;
        else if (result.code === 'UNREGISTERED') dead.push(device.token);
      }
      if (dead.length > 0) await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
      return delivered;
    } catch (error) {
      this.logger.warn(`The push for feedback ${feedbackId} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async list(query: AdminFeedbackQuery): Promise<Paginated<AdminFeedbackItem>> {
    const where: Prisma.FeedbackWhereInput = {
      category: query.category,
      ...(query.q
        ? {
            OR: [
              { message: { contains: query.q, mode: 'insensitive' } },
              { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { user: { phoneNumber: { contains: query.q.replace(/[\s\-()]/g, '') } } },
              ...(normalizeAfghanMobile(query.q) ? [{ user: { phoneNumber: normalizeAfghanMobile(query.q)! } }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        include: feedbackInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return {
      data: rows.map(toItem),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }
}

function toItem(row: FeedbackRow): AdminFeedbackItem {
  return {
    id: row.id,
    category: row.category,
    message: row.message,
    app_version: row.appVersion,
    created_at: row.createdAt.toISOString(),
    user: toAdminPerson(row.user),
    reply: row.adminReply && row.repliedAt ? { message: row.adminReply, replied_at: row.repliedAt.toISOString() } : null,
  };
}
