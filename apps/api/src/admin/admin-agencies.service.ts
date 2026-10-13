import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminAgencyItem, Paginated } from '@bongah/shared-types';
import type { AdminAgenciesQuery, ReviewAgencyInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { adminPersonSelect, toAdminPerson } from '../common/admin-person.js';
import { AgencyVerificationStatus, Prisma, SubscriptionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const agencyInclude = { user: { select: adminPersonSelect } } satisfies Prisma.AgencyInclude;
type AgencyRow = Prisma.AgencyGetPayload<{ include: typeof agencyInclude }>;

@Injectable()
export class AdminAgenciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The review queue: PENDING first-come-first-served (oldest first); other views newest first. */
  async list(query: AdminAgenciesQuery): Promise<Paginated<AdminAgencyItem>> {
    const where: Prisma.AgencyWhereInput = {
      verificationStatus: query.status,
      ...(query.q
        ? {
            OR: [
              { agencyName: { contains: query.q, mode: 'insensitive' } },
              { user: { phoneNumber: { contains: query.q.replace(/[\s\-()]/g, '') } } },
            ],
          }
        : {}),
    };
    const oldestFirst = query.status === AgencyVerificationStatus.PENDING;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agency.findMany({
        where,
        include: agencyInclude,
        orderBy: [{ createdAt: oldestFirst ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.agency.count({ where }),
    ]);
    const subscribed = await this.withActiveSubscription(rows.map((row) => row.id));
    return {
      data: rows.map((row) => toItem(row, subscribed.has(row.id))),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string): Promise<AdminAgencyItem> {
    const row = await this.prisma.agency.findUnique({ where: { id }, include: agencyInclude });
    if (!row) throw new NotFoundException('Agency not found.');
    return toItem(row, (await this.withActiveSubscription([id])).has(id));
  }

  /**
   * Approves or rejects the agency's business documents. Any decision can follow any other (an
   * approved agency can be rejected later, a rejected one approved after it resubmits). `is_verified`
   * is set from the same decision in the same statement; the database refuses a row where the two
   * disagree.
   */
  async review(actorId: string, id: string, input: ReviewAgencyInput): Promise<AdminAgencyItem> {
    const now = new Date();
    const verified = input.status === 'VERIFIED';
    await this.prisma.$transaction(async (db) => {
      const locked = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM agencies WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Agency not found.');

      await db.agency.update({
        where: { id },
        data: {
          verificationStatus: verified ? AgencyVerificationStatus.VERIFIED : AgencyVerificationStatus.REJECTED,
          isVerified: verified,
          reviewedAt: now,
          reviewedById: actorId,
          rejectionReason: verified ? null : (input.reason ?? null),
        },
      });
      await recordAudit(db, {
        actorId,
        action: verified ? 'AGENCY_VERIFIED' : 'AGENCY_REJECTED',
        targetType: 'agency',
        targetId: id,
        ...(verified ? {} : { metadata: { reason: input.reason ?? null } }),
      });
    });
    return this.get(id);
  }

  private async withActiveSubscription(agencyIds: string[]): Promise<Set<string>> {
    if (agencyIds.length === 0) return new Set();
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: {
        agencyId: { in: agencyIds },
        status: SubscriptionStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gt: now },
      },
      select: { agencyId: true },
      distinct: ['agencyId'],
    });
    return new Set(rows.map((row) => row.agencyId));
  }
}

function toItem(row: AgencyRow, subscriptionActive: boolean): AdminAgencyItem {
  return {
    id: row.id,
    agency_name: row.agencyName,
    license_photo: row.licensePhoto,
    address: row.address,
    description: row.description,
    verification_status: row.verificationStatus,
    is_verified: row.isVerified,
    rejection_reason: row.rejectionReason,
    reviewed_at: row.reviewedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    owner: toAdminPerson(row.user),
    subscription_active: subscriptionActive,
  };
}
