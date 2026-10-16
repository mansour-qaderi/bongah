import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUnitOf, type PropertyType, type PropertyUnitType } from '@bongah/shared-types';
import { findActiveSubscription } from '../agencies/subscription.js';
import { Prisma, PropertyStatus, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { ListPropertiesDto, PaginationDto } from './dto/list-properties.dto.js';
import type { PropertyDto, PropertyPageDto } from './dto/property-response.dto.js';
import type { UpdatePropertyDto } from './dto/update-property.dto.js';
import { kabulDayKey } from '../contact/contact.time.js';
import { FREE_LISTINGS_PER_MONTH } from './property.constants.js';
import { toPropertyDto, WITH_AGENCY_NAME } from './property.mapper.js';
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

  /** Public search: active listings only, and never those of a banned account. */
  async list(query: ListPropertiesDto): Promise<PropertyPageDto> {
    const hasPriceRange = query.min_price !== undefined || query.max_price !== undefined;
    const where: Prisma.PropertyWhereInput = {
      status: PropertyStatus.ACTIVE,
      user: { bannedAt: null },
      province: query.province,
      district: query.district,
      type: query.type,
      unitType: query.unit_type,
      dealType: query.deal_type,
      // true: listings with an exact pin (the map); false: those without; omitted: all.
      ...(query.has_location === undefined ? {} : { lat: query.has_location ? { not: null } : null }),
      // The part of the map on screen (all four are given together; the schema guarantees it). Only listings with a
      // pin can be inside, so a null lat/lng never matches.
      ...(query.min_lat === undefined
        ? {}
        : {
            lat: { gte: query.min_lat, lte: query.max_lat },
            lng: { gte: query.min_lng, lte: query.max_lng },
          }),
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

  /** A single listing. Archived listings (and a banned account's) are gone for everyone (owners see them via /mine). */
  async findOne(id: string): Promise<PropertyDto> {
    const row = await this.prisma.property.findFirst({
      where: { id, status: { not: PropertyStatus.ARCHIVED }, user: { bannedAt: null } },
      include: WITH_AGENCY_NAME,
    });
    if (!row) throw new NotFoundException('Property not found.');
    return toPropertyDto(row, new Date());
  }

  /**
   * Counts one view of an ACTIVE listing. Fire-and-forget: a listing that is missing or no longer
   * active is silently ignored, so the app never has to handle an error for a statistic.
   *
   * Raw SQL on purpose: it is one atomic increment (no read-modify-write race), and a Prisma
   * update would also bump updated_at, which means "the owner edited this listing". The same
   * statement adds the view to today's (Kabul day) row for the analytics chart, so the lifetime
   * counter and the daily counts cannot disagree.
   */
  async recordView(id: string): Promise<void> {
    const day = kabulDayKey(new Date()).toISOString().slice(0, 10);
    await this.prisma.$executeRaw`
      WITH hit AS (
        UPDATE properties SET view_count = view_count + 1
         WHERE id = ${id}::uuid AND status = 'ACTIVE'
        RETURNING id)
      INSERT INTO property_view_days (property_id, day, count)
      SELECT id, ${day}::date, 1 FROM hit
      ON CONFLICT (property_id, day) DO UPDATE SET count = property_view_days.count + 1`;
  }

  /**
   * Creates a listing, enforcing who may publish:
   *  - USER:   FREE_LISTINGS_PER_MONTH per Kabul calendar month. Every row created this month counts,
   *            whatever its status, so archiving or deleting a listing can't be used to get another.
   *  - AGENCY: needs an agency profile and a currently active subscription; no monthly cap.
   *  - ADMIN:  unrestricted.
   * An exact map pin (lat/lng) is free for everyone and optional. Without one the written place
   * (district, neighbourhood, address) is required; with one it is optional (the schema enforces that),
   * and anything left out is stored as an empty string / null.
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

      const {
        deal_type,
        area_sqm,
        bedrooms,
        bathrooms,
        images,
        description,
        district,
        neighborhood,
        address,
        unit_type,
        ...rest
      } = input;
      const created = await tx.property.create({
        data: {
          ...rest,
          description: description ?? '',
          district: district ?? '',
          neighborhood: neighborhood ?? null,
          address: address ?? '',
          userId,
          agencyId,
          unitType: unit_type ?? null,
          dealType: deal_type,
          areaSqm: area_sqm,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          images: images ?? [],
          // New listings enter the feed at "now"; a paid ladder later moves this forward.
          createdAt: now,
          ladderedAt: now,
        },
        include: WITH_AGENCY_NAME,
      });
      return created;
    });

    return toPropertyDto(row, now);
  }

  /**
   * Edits a listing. Only its owner (or an admin) may. Adding or moving the map pin is free.
   * The listing row is locked while this runs, so two simultaneous edits apply one after the other.
   */
  async update(userId: string, id: string, input: UpdatePropertyDto): Promise<PropertyDto> {
    const now = new Date();
    const { deal_type, area_sqm, unit_type, ...rest } = input;

    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { user_id: string; removed_by_admin_at: Date | null; type: PropertyType; unit_type: PropertyUnitType | null }[]
      >`SELECT user_id, removed_by_admin_at, type::text AS type, unit_type::text AS unit_type
        FROM properties WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Property not found.');
      const actorRole = await this.assertCanModify(tx, userId, locked[0].user_id);
      // A listing an admin took down stays down: only an admin can touch it (restore it, say).
      if (locked[0].removed_by_admin_at && actorRole !== Role.ADMIN) {
        throw new ForbiddenException({
          message: 'This listing was removed by the Bongah team.',
          code: 'LISTING_REMOVED',
        });
      }

      // The unit has to belong to the type the listing ends up with. A unit sent now is checked against the type
      // sent now or, failing that, the stored one; a stored unit that the new type does not have is cleared.
      const typeAfter = rest.type ?? locked[0].type;
      let unitAfter: PropertyUnitType | null | undefined;
      if (unit_type !== undefined) {
        if (unit_type !== null && !isUnitOf(typeAfter, unit_type)) {
          throw new BadRequestException({
            message: 'This unit does not belong to the property type.',
            code: 'UNIT_NOT_OF_TYPE',
          });
        }
        unitAfter = unit_type;
      } else if (locked[0].unit_type && !isUnitOf(typeAfter, locked[0].unit_type)) {
        unitAfter = null;
      }

      return tx.property.update({
        where: { id },
        data: {
          ...rest,
          ...(unitAfter !== undefined ? { unitType: unitAfter } : {}),
          ...(deal_type !== undefined ? { dealType: deal_type } : {}),
          ...(area_sqm !== undefined ? { areaSqm: area_sqm } : {}),
        },
        include: WITH_AGENCY_NAME,
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
        include: WITH_AGENCY_NAME,
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
