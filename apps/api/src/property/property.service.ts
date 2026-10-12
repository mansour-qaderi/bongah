import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PropertyStatus, Role, SubscriptionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { ListPropertiesDto, PaginationDto } from './dto/list-properties.dto.js';
import type { PropertyDto, PropertyPageDto } from './dto/property-response.dto.js';
import type { UpdatePropertyDto } from './dto/update-property.dto.js';
import { FREE_LISTINGS_PER_MONTH } from './property.constants.js';
import { toPropertyDto } from './property.mapper.js';
import { kabulMonthStart, nextKabulMonthStart } from './property.time.js';

/** Newest ladder first. Rows with no ladder time (legacy) sort last, then newest created. */
const LISTING_ORDER: Prisma.PropertyOrderByWithRelationInput[] = [
  { ladderedAt: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
  { id: 'desc' }, // total order, so pages never repeat or skip rows
];

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Public search: active listings only. */
  async list(query: ListPropertiesDto): Promise<PropertyPageDto> {
    const hasPriceRange = query.min_price !== undefined || query.max_price !== undefined;
    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.ACTIVE,
      province: query.province,
      district: query.district,
      type: query.type,
      dealType: query.deal_type,
      // The schema guarantees a currency whenever a price bound is present.
      currency: query.currency,
      ...(hasPriceRange ? { price: { gte: query.min_price, lte: query.max_price } } : {}),
    };
    return this.page(where, query);
  }

  /** The signed-in user's own listings, in every status. */
  listMine(userId: string, query: PaginationDto): Promise<PropertyPageDto> {
    return this.page({ userId }, query);
  }

  /** A single listing. Archived listings are gone for everyone (owners see them via /mine). */
  async findOne(id: string): Promise<PropertyDto> {
    const row = await this.prisma.property.findFirst({
      where: { id, status: { not: PropertyStatus.ARCHIVED } },
    });
    if (!row) throw new NotFoundException('Property not found.');
    return toPropertyDto(row, new Date());
  }

  /**
   * Creates a listing, enforcing who may publish:
   *  - USER:   FREE_LISTINGS_PER_MONTH per Kabul calendar month. Every row created this month counts,
   *            whatever its status, so archiving or deleting a listing can't be used to get another.
   *  - AGENCY: needs an agency profile and a currently active subscription; no monthly cap.
   *  - ADMIN:  unrestricted.
   *
   * The role is read from the database (the JWT's copy may be days old), and the user row is
   * locked for the transaction, so two simultaneous requests can't both pass the quota check.
   */
  async create(userId: string, input: CreatePropertyDto): Promise<PropertyDto> {
    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<{ role: Role }[]>`
        SELECT role::text AS role FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (users.length === 0) {
        throw new UnauthorizedException(); // valid token, but the account no longer exists
      }

      let agencyId: string | null = null;
      switch (users[0].role) {
        case Role.USER: {
          const monthStart = kabulMonthStart(now);
          const used = await tx.property.count({
            where: { userId, createdAt: { gte: monthStart } },
          });
          if (used >= FREE_LISTINGS_PER_MONTH) {
            throw new ForbiddenException({
              message: 'Free listing limit reached for this month. It resets next month.',
              code: 'FREE_LISTING_LIMIT_REACHED',
              limit: FREE_LISTINGS_PER_MONTH,
              resets_at: nextKabulMonthStart(now).toISOString(),
            });
          }
          break;
        }
        case Role.AGENCY: {
          const agency = await tx.agency.findUnique({ where: { userId }, select: { id: true } });
          if (!agency) {
            throw new ForbiddenException({
              message: 'Register your agency before publishing listings.',
              code: 'AGENCY_PROFILE_REQUIRED',
            });
          }
          const subscription = await tx.subscription.findFirst({
            where: {
              agencyId: agency.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: { lte: now },
              endDate: { gt: now },
            },
            select: { id: true },
          });
          if (!subscription) {
            throw new ForbiddenException({
              message: 'An active subscription is required to publish listings.',
              code: 'SUBSCRIPTION_REQUIRED',
            });
          }
          agencyId = agency.id;
          break;
        }
        case Role.ADMIN:
          break;
      }

      const { deal_type, area_sqm, bedrooms, bathrooms, images, ...rest } = input;
      return tx.property.create({
        data: {
          ...rest,
          userId,
          agencyId,
          dealType: deal_type,
          areaSqm: area_sqm,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          images: images ?? [],
          // New listings enter the feed at "now"; a paid ladder later moves this forward.
          createdAt: now,
          ladderedAt: now,
        },
      });
    });

    return toPropertyDto(row, now);
  }

  /** Edits a listing. Only its owner (or an admin) may. */
  async update(userId: string, id: string, input: UpdatePropertyDto): Promise<PropertyDto> {
    const existing = await this.prisma.property.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Property not found.');
    await this.assertCanModify(userId, existing.userId);

    const { deal_type, area_sqm, ...rest } = input;
    const row = await this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        ...(deal_type !== undefined ? { dealType: deal_type } : {}),
        ...(area_sqm !== undefined ? { areaSqm: area_sqm } : {}),
      },
    });
    return toPropertyDto(row, new Date());
  }

  /**
   * "Delete" archives the listing. The row is kept: it still counts toward the monthly free
   * quota and keeps payment history intact (transactions reference it).
   */
  async archive(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.property.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Property not found.');
    await this.assertCanModify(userId, existing.userId);
    await this.prisma.property.update({ where: { id }, data: { status: PropertyStatus.ARCHIVED } });
  }

  private async assertCanModify(actorId: string, ownerId: string): Promise<void> {
    if (actorId === ownerId) return;
    // Read from the database, not the JWT: a demoted admin must lose access immediately.
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });
    if (actor?.role !== Role.ADMIN) {
      this.logger.warn(`User ${actorId} tried to modify a listing owned by ${ownerId}`);
      throw new ForbiddenException('You can only change your own listings.');
    }
  }

  private async page(where: Prisma.PropertyWhereInput, p: PaginationDto): Promise<PropertyPageDto> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: LISTING_ORDER,
        skip: (p.page - 1) * p.limit,
        take: p.limit,
      }),
      this.prisma.property.count({ where }),
    ]);
    const now = new Date();
    return {
      data: rows.map((row) => toPropertyDto(row, now)),
      meta: { page: p.page, limit: p.limit, total, total_pages: Math.ceil(total / p.limit) },
    };
  }
}
