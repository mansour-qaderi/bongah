import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminPropertyItem, Paginated } from '@bongah/shared-types';
import type { AdminPropertiesQuery } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { adminPersonSelect, toAdminPerson } from '../common/admin-person.js';
import { Prisma } from '../generated/prisma/client.js';
import { restoreListing, takeDownListing } from '../moderation/moderation.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPropertyDto } from '../property/property.mapper.js';
import { PromotionService } from '../promotion/promotion.service.js';

const propertyInclude = { user: { select: adminPersonSelect } } satisfies Prisma.PropertyInclude;
type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof propertyInclude }>;

@Injectable()
export class AdminPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotion: PromotionService,
  ) {}

  /** Every listing in every status, newest first. */
  async list(query: AdminPropertiesQuery): Promise<Paginated<AdminPropertyItem>> {
    const now = new Date();
    const and: Prisma.PropertyWhereInput[] = [];
    if (query.featured !== undefined) {
      // The same rule as isFeaturedAt(). The "not featured" side is spelled out: a NOT around
      // a comparison with a NULL featured_until would silently drop those rows.
      and.push(
        query.featured
          ? { isFeatured: true, featuredUntil: { gt: now } }
          : { OR: [{ isFeatured: false }, { featuredUntil: null }, { featuredUntil: { lte: now } }] },
      );
    }
    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { user: { phoneNumber: { contains: query.q.replace(/[\s\-()]/g, '') } } },
        ],
      });
    }
    const where: Prisma.PropertyWhereInput = {
      status: query.status,
      userId: query.owner_id,
      ...(query.removed === undefined ? {} : { removedByAdminAt: query.removed ? { not: null } : null }),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: propertyInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.property.count({ where }),
    ]);
    return {
      data: rows.map((row) => toItem(row, now)),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  async get(id: string): Promise<AdminPropertyItem> {
    const row = await this.prisma.property.findUnique({ where: { id }, include: propertyInclude });
    if (!row) throw new NotFoundException('Property not found.');
    return toItem(row, new Date());
  }

  /**
   * Gives a listing the featured badge for `days` days, free of charge (a partnership, a make-good). It
   * stacks with a running promotion exactly like a paid one. Only an ACTIVE listing can be featured.
   */
  async feature(actorId: string, id: string, days: number): Promise<AdminPropertyItem> {
    await this.prisma.$transaction(async (db) => {
      const until = await this.promotion.feature(db, id, days, new Date());
      if (until === null) {
        const exists = await db.property.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException('Property not found.');
        throw new ConflictException({ message: 'Only an active listing can be featured.', code: 'PROPERTY_NOT_ACTIVE' });
      }
      await recordAudit(db, {
        actorId,
        action: 'LISTING_FEATURED',
        targetType: 'property',
        targetId: id,
        metadata: { days, until: until.toISOString() },
      });
    });
    return this.get(id);
  }

  /** Ends the featured badge now, whether it was paid for or granted. */
  async unfeature(actorId: string, id: string): Promise<AdminPropertyItem> {
    await this.prisma.$transaction(async (db) => {
      const updated = await db.property.updateMany({
        where: { id },
        data: { isFeatured: false, featuredUntil: null },
      });
      if (updated.count === 0) throw new NotFoundException('Property not found.');
      await recordAudit(db, { actorId, action: 'LISTING_UNFEATURED', targetType: 'property', targetId: id });
    });
    return this.get(id);
  }

  /** Takes a listing down. Idempotent: taking down a listing that is already down changes nothing. */
  async remove(actorId: string, id: string, reason: string): Promise<AdminPropertyItem> {
    await this.prisma.$transaction((db) => takeDownListing(db, actorId, id, reason, new Date()));
    return this.get(id);
  }

  async restore(actorId: string, id: string): Promise<AdminPropertyItem> {
    await this.prisma.$transaction((db) => restoreListing(db, actorId, id));
    return this.get(id);
  }
}

function toItem(row: PropertyRow, now: Date): AdminPropertyItem {
  return {
    ...toPropertyDto(row, now),
    view_count: row.viewCount,
    removed_by_admin_at: row.removedByAdminAt?.toISOString() ?? null,
    removal_reason: row.removalReason,
    owner: toAdminPerson(row.user),
  };
}
