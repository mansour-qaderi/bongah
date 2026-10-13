import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { findActiveSubscription } from '../agencies/subscription.js';
import { Prisma, PropertyStatus, Role } from '../generated/prisma/client.js';
import { MapLocationService } from '../map-location/map-location.service.js';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapLocation: MapLocationService,
  ) {}

  /** Public search: active listings only. */
  async list(query: ListPropertiesDto): Promise<PropertyPageDto> {
    const hasPriceRange = query.min_price !== undefined || query.max_price !== undefined;
    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.ACTIVE,
      province: query.province,
      district: query.district,
      type: query.type,
      dealType: query.deal_type,
      // true: listings with an exact pin (the map); false: those without; omitted: all.
      ...(query.has_location === undefined ? {} : { lat: query.has_location ? { not: null } : null }),
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
   * Counts one view of an ACTIVE listing. Fire-and-forget: a listing that is missing or no longer
   * active is silently ignored, so the app never has to handle an error for a statistic.
   *
   * Raw SQL on purpose: it is one atomic increment (no read-modify-write race), and a Prisma
   * update would also bump updated_at, which means "the owner edited this listing".
   */
  async recordView(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE properties SET view_count = view_count + 1
      WHERE id = ${id}::uuid AND status = 'ACTIVE'`;
  }

  /**
   * Creates a listing, enforcing who may publish:
   *  - USER:   FREE_LISTINGS_PER_MONTH per Kabul calendar month. Every row created this month counts,
   *            whatever its status, so archiving or deleting a listing can't be used to get another.
   *  - AGENCY: needs an agency profile and a currently active subscription; no monthly cap.
   *  - ADMIN:  unrestricted.
   * Exact coordinates (lat/lng) are optional and are accepted only from an active agency, an admin,
   * or a user who spends a prepaid Map Location token on this listing (403 MAP_LOCATION_REQUIRED).
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
          if (!(await findActiveSubscription(tx, agency.id, now))) {
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
      const created = await tx.property.create({
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
      // An exact pin is a paid feature (agency subscription or a prepaid token). Charged in this
      // same transaction, so a refusal also undoes the listing: nothing is published unpinned
      // by surprise and no free monthly listing is used up.
      if (input.lat !== undefined) {
        await this.mapLocation.chargeForPin(tx, userId, users[0].role, created.id, now);
      }
      return created;
    });

    return toPropertyDto(row, now);
  }

  /**
   * Edits a listing. Only its owner (or an admin) may.
   *
   * Giving a listing its FIRST pin is the paid step (same rule as on create). Moving a pin that is
   * already there is free. The listing row is locked while this runs, so two simultaneous edits
   * can't both see "no pin yet" and spend two tokens on one listing.
   */
  async update(userId: string, id: string, input: UpdatePropertyDto): Promise<PropertyDto> {
    const now = new Date();
    const { deal_type, area_sqm, ...rest } = input;

    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ user_id: string; lat: number | null }[]>`
        SELECT user_id, lat FROM properties WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Property not found.');
      const actorRole = await this.assertCanModify(tx, userId, locked[0].user_id);

      if (input.lat !== undefined && locked[0].lat === null) {
        await this.mapLocation.chargeForPin(tx, userId, actorRole, id, now);
      }

      return tx.property.update({
        where: { id },
        data: {
          ...rest,
          ...(deal_type !== undefined ? { dealType: deal_type } : {}),
          ...(area_sqm !== undefined ? { areaSqm: area_sqm } : {}),
        },
      });
    });
    return toPropertyDto(row, now);
  }

  /**
   * "Delete" archives the listing. The row is kept: it still counts toward the monthly free
   * quota and keeps payment history intact (transactions reference it).
   */
  async archive(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.property.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Property not found.');
    await this.assertCanModify(this.prisma, userId, existing.userId);
    await this.prisma.property.update({ where: { id }, data: { status: PropertyStatus.ARCHIVED } });
  }

  /** Throws unless the actor owns the listing or is an admin. Returns the actor's role as stored in the database. */
  private async assertCanModify(
    db: Prisma.TransactionClient,
    actorId: string,
    ownerId: string,
  ): Promise<Role> {
    // Read from the database, not the JWT: a demoted admin must lose access immediately.
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor) throw new UnauthorizedException();
    if (actorId !== ownerId && actor.role !== Role.ADMIN) {
      this.logger.warn(`User ${actorId} tried to modify a listing owned by ${ownerId}`);
      throw new ForbiddenException('You can only change your own listings.');
    }
    return actor.role;
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
