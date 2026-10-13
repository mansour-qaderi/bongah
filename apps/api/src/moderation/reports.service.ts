import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { AbuseReportItem, Paginated, ReportFiled } from '@bongah/shared-types';
import type { AdminReportsQuery, CreateReportInput, ResolveReportInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import {
  AbuseReportStatus,
  AbuseTargetType,
  Prisma,
  PropertyStatus,
} from '../generated/prisma/client.js';
import { toAdminPerson } from '../common/admin-person.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BansService } from './bans.service.js';
import { banUser, takeDownListing } from './moderation.actions.js';

/** A reporter can have this many reports waiting at once: a brake on someone flooding the queue. */
const MAX_OPEN_REPORTS_PER_REPORTER = 30;

const reportInclude = {
  reporter: { select: { id: true, fullName: true, phoneNumber: true, bannedAt: true } },
  targetUser: { select: { id: true, fullName: true, phoneNumber: true, bannedAt: true } },
  targetProperty: { select: { id: true, title: true, status: true, removedByAdminAt: true } },
} satisfies Prisma.AbuseReportInclude;

type ReportRow = Prisma.AbuseReportGetPayload<{ include: typeof reportInclude }>;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bans: BansService,
  ) {}

  /** Files a report about an account or a listing. One open report per reporter and target. */
  async create(reporterId: string, input: CreateReportInput): Promise<ReportFiled> {
    let targetUserId: string;
    let targetPropertyId: string | null = null;

    if (input.target_type === AbuseTargetType.USER) {
      const user = await this.prisma.user.findUnique({ where: { id: input.target_id }, select: { id: true } });
      if (!user) throw new NotFoundException('User not found.');
      targetUserId = user.id;
    } else {
      const property = await this.prisma.property.findFirst({
        where: { id: input.target_id, status: { not: PropertyStatus.ARCHIVED } },
        select: { id: true, userId: true },
      });
      if (!property) throw new NotFoundException('Property not found.');
      targetUserId = property.userId;
      targetPropertyId = property.id;
    }
    if (targetUserId === reporterId) {
      throw new ConflictException({ message: 'You cannot report yourself.', code: 'CANNOT_REPORT_SELF' });
    }

    const open = await this.prisma.abuseReport.count({
      where: { reporterId, status: AbuseReportStatus.OPEN },
    });
    if (open >= MAX_OPEN_REPORTS_PER_REPORTER) {
      throw new HttpException(
        { message: 'You have too many reports waiting for review.', code: 'TOO_MANY_OPEN_REPORTS' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const report = await this.prisma.abuseReport.create({
        data: {
          reporterId,
          targetType: input.target_type,
          targetUserId,
          targetPropertyId,
          reason: input.reason,
          details: input.details ?? null,
        },
      });
      return { id: report.id, status: report.status, created_at: report.createdAt.toISOString() };
    } catch (error) {
      // The partial UNIQUE indexes: this reporter already has an open report about the same thing.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'You already reported this. The team will look at it.',
          code: 'ALREADY_REPORTED',
        });
      }
      throw error;
    }
  }

  // ───────────── admin ─────────────

  /** The moderation queue: oldest open reports first when filtering OPEN, newest first otherwise. */
  async list(query: AdminReportsQuery): Promise<Paginated<AbuseReportItem>> {
    const where: Prisma.AbuseReportWhereInput = {
      status: query.status,
      targetType: query.target_type,
      reason: query.reason,
      targetUserId: query.target_user_id,
    };
    const oldestFirst = query.status === AbuseReportStatus.OPEN;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.abuseReport.findMany({
        where,
        include: reportInclude,
        orderBy: [{ createdAt: oldestFirst ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.abuseReport.count({ where }),
    ]);
    return {
      data: rows.map(toReportItem),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string): Promise<AbuseReportItem> {
    const row = await this.prisma.abuseReport.findUnique({ where: { id }, include: reportInclude });
    if (!row) throw new NotFoundException('Report not found.');
    return toReportItem(row);
  }

  /**
   * Decides an OPEN report. All of it (the outcome, the ban / takedown it asked for, closing the other
   * open reports about the same thing, the audit line) commits together or not at all. Deciding twice
   * is refused (409 REPORT_ALREADY_CLOSED): the report row is locked for the decision.
   *
   * BAN_USER and REMOVE_LISTING also close every OTHER open report about the same account / listing as
   * resolved, so the queue does not keep asking about something already dealt with.
   */
  async resolve(actorId: string, id: string, input: ResolveReportInput): Promise<AbuseReportItem> {
    const now = new Date();
    let bannedUserId: string | null = null;

    await this.prisma.$transaction(async (db) => {
      const rows = await db.$queryRaw<
        { status: AbuseReportStatus; target_type: AbuseTargetType; target_user_id: string; target_property_id: string | null }[]
      >`SELECT status::text AS status, target_type::text AS target_type, target_user_id, target_property_id
          FROM abuse_reports WHERE id = ${id}::uuid FOR UPDATE`;
      const report = rows[0];
      if (!report) throw new NotFoundException('Report not found.');
      if (report.status !== AbuseReportStatus.OPEN) {
        throw new ConflictException({ message: 'This report was already decided.', code: 'REPORT_ALREADY_CLOSED' });
      }

      const close = (status: AbuseReportStatus, where: Prisma.AbuseReportWhereInput, note: string | null) =>
        db.abuseReport.updateMany({
          where: { status: AbuseReportStatus.OPEN, ...where },
          data: { status, resolvedById: actorId, resolvedAt: now, resolutionNote: note },
        });

      switch (input.action) {
        case 'DISMISS':
          await close(AbuseReportStatus.DISMISSED, { id }, input.note ?? null);
          await recordAudit(db, { actorId, action: 'REPORT_DISMISSED', targetType: 'report', targetId: id });
          break;

        case 'RESOLVE':
          await close(AbuseReportStatus.RESOLVED, { id }, input.note ?? null);
          await recordAudit(db, { actorId, action: 'REPORT_RESOLVED', targetType: 'report', targetId: id });
          break;

        case 'BAN_USER': {
          const reason = input.note as string; // required by the schema for this action
          await banUser(db, actorId, report.target_user_id, reason, now);
          bannedUserId = report.target_user_id;
          await close(AbuseReportStatus.RESOLVED, { id }, reason);
          await close(
            AbuseReportStatus.RESOLVED,
            { targetUserId: report.target_user_id },
            `Account banned (report ${id}).`,
          );
          await recordAudit(db, {
            actorId,
            action: 'REPORT_RESOLVED',
            targetType: 'report',
            targetId: id,
            metadata: { action: 'BAN_USER', user_id: report.target_user_id },
          });
          break;
        }

        case 'REMOVE_LISTING': {
          if (!report.target_property_id) {
            throw new BadRequestException({
              message: 'Only a report about a listing can remove a listing.',
              code: 'ACTION_NOT_APPLICABLE',
            });
          }
          const reason = input.note as string;
          await takeDownListing(db, actorId, report.target_property_id, reason, now);
          await close(AbuseReportStatus.RESOLVED, { id }, reason);
          await close(
            AbuseReportStatus.RESOLVED,
            { targetPropertyId: report.target_property_id },
            `Listing removed (report ${id}).`,
          );
          await recordAudit(db, {
            actorId,
            action: 'REPORT_RESOLVED',
            targetType: 'report',
            targetId: id,
            metadata: { action: 'REMOVE_LISTING', property_id: report.target_property_id },
          });
          break;
        }
      }
    });

    // After the commit, so a reconnect is already refused when the connections are cut.
    if (bannedUserId) this.bans.disconnect(bannedUserId);
    return this.get(id);
  }
}

function toReportItem(row: ReportRow): AbuseReportItem {
  return {
    id: row.id,
    status: row.status,
    target_type: row.targetType,
    reason: row.reason,
    details: row.details,
    created_at: row.createdAt.toISOString(),
    reporter: toAdminPerson(row.reporter),
    target_user: toAdminPerson(row.targetUser),
    target_property: row.targetProperty
      ? {
          id: row.targetProperty.id,
          title: row.targetProperty.title,
          status: row.targetProperty.status,
          removed_by_admin_at: row.targetProperty.removedByAdminAt?.toISOString() ?? null,
        }
      : null,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    resolved_by: row.resolvedById,
    resolution_note: row.resolutionNote,
  };
}
