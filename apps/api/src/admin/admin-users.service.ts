import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUserDetail, AdminUserItem, Paginated } from '@bongah/shared-types';
import { normalizeAfghanMobile, type AdminUsersQuery, type GiftUserInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { toAdminPerson } from '../common/admin-person.js';
import { AbuseReportStatus, Prisma, PropertyStatus, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const userInclude = {
  agency: { select: { id: true, agencyName: true, verificationStatus: true } },
} satisfies Prisma.UserInclude;
type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminUsersQuery): Promise<Paginated<AdminUserItem>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      ...(query.banned === undefined ? {} : { bannedAt: query.banned ? { not: null } : null }),
      ...(query.q ? { OR: searchConditions(query.q) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const open = await this.openReportCounts(rows.map((row) => row.id));
    return {
      data: rows.map((row) => toItem(row, open.get(row.id) ?? 0)),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!row) throw new NotFoundException('User not found.');

    const [byStatus, filed, against, open] = await Promise.all([
      this.prisma.property.groupBy({ by: ['status'], where: { userId: id }, _count: { _all: true } }),
      this.prisma.abuseReport.count({ where: { reporterId: id } }),
      this.prisma.abuseReport.count({ where: { targetUserId: id } }),
      this.openReportCounts([id]),
    ]);
    const countOf = (status: PropertyStatus) => byStatus.find((group) => group.status === status)?._count._all ?? 0;
    return {
      ...toItem(row, open.get(id) ?? 0),
      listings: {
        active: countOf(PropertyStatus.ACTIVE),
        sold: countOf(PropertyStatus.SOLD),
        archived: countOf(PropertyStatus.ARCHIVED),
      },
      reports_filed: filed,
      reports_against: against,
    };
  }

  /**
   * Gives an account free listings and/or featured frames. A person's extra listings are the welcome credits, an office's
   * are its bonus listings (the same counters the sign-up gift and the ladder unlock use), so the quota code spends them
   * as it spends those. The audit line says how many, never why in more than the short note.
   */
  async gift(adminId: string, id: string, input: GiftUserInput): Promise<AdminUserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!user) throw new NotFoundException('User not found.');
      const listingField = user.role === Role.AGENCY ? 'bonusListingCredits' : 'welcomeListingCredits';
      await tx.user.update({
        where: { id },
        data: {
          ...(input.listing_credits > 0 ? { [listingField]: { increment: input.listing_credits } } : {}),
          ...(input.featured_credits > 0 ? { featuredCredits: { increment: input.featured_credits } } : {}),
        },
      });
      await recordAudit(tx, {
        actorId: adminId,
        action: 'USER_GIFTED',
        targetType: 'user',
        targetId: id,
        metadata: {
          listing_credits: input.listing_credits,
          featured_credits: input.featured_credits,
          ...(input.note ? { note: input.note } : {}),
        },
      });
    });
    return this.get(id);
  }

  private async openReportCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const groups = await this.prisma.abuseReport.groupBy({
      by: ['targetUserId'],
      where: { status: AbuseReportStatus.OPEN, targetUserId: { in: userIds } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.targetUserId, group._count._all]));
  }
}

/** A name, or a phone number typed any usual way (0700…, +93700…, with spaces). */
function searchConditions(q: string): Prisma.UserWhereInput[] {
  const conditions: Prisma.UserWhereInput[] = [
    { fullName: { contains: q, mode: 'insensitive' } },
    { phoneNumber: { contains: q.replace(/[\s\-()]/g, '') } },
  ];
  const normalized = normalizeAfghanMobile(q);
  if (normalized) conditions.push({ phoneNumber: normalized });
  return conditions;
}

function toItem(row: UserRow, openReportsAgainst: number): AdminUserItem {
  return {
    ...toAdminPerson(row),
    role: row.role,
    listing_credits: row.role === Role.AGENCY ? row.bonusListingCredits : row.welcomeListingCredits,
    featured_credits: row.featuredCredits,
    ban_reason: row.banReason,
    last_login_at: row.lastLoginAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    agency: row.agency
      ? { id: row.agency.id, agency_name: row.agency.agencyName, verification_status: row.agency.verificationStatus }
      : null,
    open_reports_against: openReportsAgainst,
  };
}

