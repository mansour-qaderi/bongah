import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Banner } from '@bongah/shared-types';
import type { CreateBannerInput, UpdateBannerInput } from '@bongah/validation';
import { recordAudit } from '../audit/admin-audit.js';
import { BannerPlacement, PropertyStatus, type Banner as BannerRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The banners the app should show right now: active, inside their optional time window, and, when
   * they link to a listing, only while that listing can still be opened (active, owner not banned).
   */
  async listPublic(placement: BannerPlacement | undefined, now = new Date()): Promise<Banner[]> {
    const rows = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        placement,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          {
            OR: [
              { linkPropertyId: null },
              { linkProperty: { status: PropertyStatus.ACTIVE, user: { bannedAt: null } } },
            ],
          },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toBanner);
  }

  // ───────────── admin ─────────────

  /** Every banner, including inactive and expired ones. */
  async listAll(): Promise<Banner[]> {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toBanner);
  }

  async create(actorId: string, input: CreateBannerInput): Promise<Banner> {
    await this.assertLinkExists(input.link_property_id);
    return this.prisma.$transaction(async (db) => {
      const row = await db.banner.create({
        data: {
          title: input.title,
          imageUrl: input.image_url,
          linkPropertyId: input.link_property_id,
          linkUrl: input.link_url,
          placement: input.placement,
          sortOrder: input.sort_order,
          isActive: input.is_active,
          startsAt: input.starts_at ? new Date(input.starts_at) : null,
          endsAt: input.ends_at ? new Date(input.ends_at) : null,
          createdById: actorId,
        },
      });
      await recordAudit(db, {
        actorId,
        action: 'BANNER_CREATED',
        targetType: 'banner',
        targetId: row.id,
        metadata: { title: row.title, placement: row.placement },
      });
      return toBanner(row);
    });
  }

  /**
   * Changes a banner. The rules that span fields (one link at most, the window runs forward) are checked
   * against the banner as it WOULD be after the change, so editing one field cannot break them.
   */
  async update(actorId: string, id: string, input: UpdateBannerInput): Promise<Banner> {
    await this.assertLinkExists(input.link_property_id ?? null);
    return this.prisma.$transaction(async (db) => {
      const current = await db.banner.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Banner not found.');

      // Choosing one kind of link clears the other, so "switch from a web address to a listing" is one edit.
      const linkPropertyId =
        input.link_property_id !== undefined ? input.link_property_id : input.link_url ? null : current.linkPropertyId;
      const linkUrl =
        input.link_url !== undefined ? input.link_url : input.link_property_id ? null : current.linkUrl;
      const startsAt = input.starts_at !== undefined ? toDate(input.starts_at) : current.startsAt;
      const endsAt = input.ends_at !== undefined ? toDate(input.ends_at) : current.endsAt;
      if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
        throw new BadRequestException({
          message: 'The end must be after the start.',
          errors: [{ field: 'ends_at', message: 'ends_at must be after starts_at' }],
        });
      }

      const row = await db.banner.update({
        where: { id },
        data: {
          title: input.title,
          imageUrl: input.image_url,
          linkPropertyId,
          linkUrl,
          placement: input.placement,
          sortOrder: input.sort_order,
          isActive: input.is_active,
          startsAt,
          endsAt,
        },
      });
      await recordAudit(db, {
        actorId,
        action: 'BANNER_UPDATED',
        targetType: 'banner',
        targetId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toBanner(row);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (db) => {
      const removed = await db.banner.deleteMany({ where: { id } });
      if (removed.count === 0) throw new NotFoundException('Banner not found.');
      await recordAudit(db, { actorId, action: 'BANNER_DELETED', targetType: 'banner', targetId: id });
    });
  }

  private async assertLinkExists(propertyId: string | null | undefined): Promise<void> {
    if (!propertyId) return;
    const found = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!found) {
      throw new BadRequestException({ message: 'The linked listing does not exist.', code: 'LINK_PROPERTY_NOT_FOUND' });
    }
  }
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function toBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    title: row.title,
    image_url: row.imageUrl,
    link_property_id: row.linkPropertyId,
    link_url: row.linkUrl,
    placement: row.placement,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    starts_at: row.startsAt?.toISOString() ?? null,
    ends_at: row.endsAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

