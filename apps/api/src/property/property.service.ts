import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SUBSCRIPTION_PLAN_BENEFITS } from '@bongah/shared-types';
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
      // One kind (`type`, older apps) or any of several (`types`); the schema refuses both together.
      type: query.types ? { in: query.types } : query.type,
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
    // A paid (featured) listing comes before every other one: that is what the promotion sells.
    return this.page(where, query, true);
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
   *  - USER:   a welcome gift first (a new account starts with one; it pays for the listing and does not count toward
   *            the monthly quota), then FREE_LISTINGS_PER_MONTH per Kabul calendar month. Every row created this
   *            month counts, whatever its status, so archiving or deleting a listing can't be used to get another.
   *  - AGENCY: needs an agency profile and a currently active subscription. Each plan comes with its own number of
   *            listings (SUBSCRIPTION_PLAN_BENEFITS: 8 for a month, 18 for three, 30 for six, 60 for a year), counted on
   *            the subscription row. Once those are used, a gift listing credit (launch gifts) pays for the listing;
   *            with none left the listing is refused.
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
      const users = await tx.$queryRaw<{ role: Role; credits: number; bonus: number }[]>`
        SELECT role::text AS role, welcome_listing_credits AS credits, bonus_listing_credits AS bonus
          FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (users.length === 0) {
        throw new UnauthorizedException(); // valid token, but the account no longer exists
      }

      let agencyId: string | null = null;
      let usedWelcomeCredit = false;
      let usedBonusCredit = false;
      switch (users[0].role) {
        case Role.USER: {
          // The gift pays first. The user row is locked, so two requests cannot both spend the one credit.
          if (users[0].credits > 0) {
            await tx.user.update({ where: { id: userId }, data: { welcomeListingCredits: { decrement: 1 } } });
            usedWelcomeCredit = true;
            break;
          }
          const monthStart = kabulMonthStart(now);
          // A listing the gift paid for is not one of the month's free listings.
          const used = await tx.property.count({
            where: { userId, createdAt: { gte: monthStart }, usedWelcomeCredit: false },
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
          const active = await findActiveSubscription(tx, agency.id, now);
          if (!active) {
            throw new ForbiddenException({
              message: 'An active subscription is required to publish listings.',
              code: 'SUBSCRIPTION_REQUIRED',
            });
          }
          agencyId = agency.id;
          // The running plan's own listings first. One conditional UPDATE takes the next slot only while there is
          // one, so even without the user-row lock two requests could not both take the last slot.
          const quota = SUBSCRIPTION_PLAN_BENEFITS[active.packageType].listings;
          const taken = await tx.$executeRaw`
            UPDATE subscriptions SET listings_used = listings_used + 1
             WHERE id = ${active.id}::uuid AND listings_used < ${quota}`;
          if (taken === 1) break;
          // The plan's listings are all used: a gift credit pays for this one, or it is refused. (The user row is
          // locked, so two requests cannot spend the same credit.)
          if (users[0].bonus <= 0) {
            throw new ForbiddenException({
              message: 'All listings of this subscription are used. Renew or buy another plan to publish more.',
              code: 'AGENCY_LISTING_LIMIT_REACHED',
              limit: quota,
            });
          }
          await tx.user.update({ where: { id: userId }, data: { bonusListingCredits: { decrement: 1 } } });
          usedBonusCredit = true;
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
        unit,
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
          unit: unit || null,
          dealType: deal_type,
          areaSqm: area_sqm,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          images: images ?? [],
          usedWelcomeCredit,
          usedBonusCredit,
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
    const { deal_type, area_sqm, unit, ...rest } = input;

    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ user_id: string; removed_by_admin_at: Date | null }[]>`
        SELECT user_id, removed_by_admin_at FROM properties WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Property not found.');
      const actorRole = await this.assertCanModify(tx, userId, locked[0].user_id);
      // A listing an admin took down stays down: only an admin can touch it (restore it, say).
      if (locked[0].removed_by_admin_at && actorRole !== Role.ADMIN) {
        throw new ForbiddenException({
          message: 'This listing was removed by the Bongah team.',
          code: 'LISTING_REMOVED',
        });
      }

      return tx.property.update({
        where: { id },
        data: {
          ...rest,
          // A blank unit clears it, like null does.
          ...(unit !== undefined ? { unit: unit || null } : {}),
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

  /**
   * One page of listings, newest ladder first (LISTING_ORDER). With `featuredFirst`, listings whose paid featured
   * period is still running come first (same order among themselves), then all the others, as one continuous list:
   * the page boundary may fall inside either group. "Still running" is the rule of isFeaturedAt(): the flag is not
   * cleared when the promotion ends, so it only counts while featured_until is ahead.
   */
  private async page(where: Prisma.PropertyWhereInput, p: PaginationDto, featuredFirst = false): Promise<PropertyPageDto> {
    const now = new Date();
    const skip = (p.page - 1) * p.limit;
    if (!featuredFirst) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.property.findMany({ where, orderBy: LISTING_ORDER, skip, take: p.limit, include: WITH_AGENCY_NAME }),
        this.prisma.property.count({ where }),
      ]);
      return pageOf(rows, total, p, now);
    }

    // The "not featured" side is spelled out: a NOT around a comparison with a NULL featured_until would silently drop
    // those rows.
    const featuredWhere: Prisma.PropertyWhereInput = { AND: [where, { isFeatured: true, featuredUntil: { gt: now } }] };
    const otherWhere: Prisma.PropertyWhereInput = {
      AND: [where, { OR: [{ isFeatured: false }, { featuredUntil: null }, { featuredUntil: { lte: now } }] }],
    };
    const [featuredCount, otherCount] = await this.prisma.$transaction([
      this.prisma.property.count({ where: featuredWhere }),
      this.prisma.property.count({ where: otherWhere }),
    ]);
    const featuredRows =
      skip < featuredCount
        ? await this.prisma.property.findMany({
            where: featuredWhere,
            orderBy: LISTING_ORDER,
            skip,
            take: Math.min(p.limit, featuredCount - skip),
            include: WITH_AGENCY_NAME,
          })
        : [];
    const room = p.limit - featuredRows.length;
    const otherRows =
      room > 0
        ? await this.prisma.property.findMany({
            where: otherWhere,
            orderBy: LISTING_ORDER,
            skip: Math.max(0, skip - featuredCount),
            take: room,
            include: WITH_AGENCY_NAME,
          })
        : [];
    return pageOf([...featuredRows, ...otherRows], featuredCount + otherCount, p, now);
  }
}

function pageOf<Row extends Parameters<typeof toPropertyDto>[0]>(
  rows: Row[],
  total: number,
  p: PaginationDto,
  now: Date,
): PropertyPageDto {
  return {
    data: rows.map((row) => toPropertyDto(row, now)),
    meta: { page: p.page, limit: p.limit, total, total_pages: Math.ceil(total / p.limit) },
  };
}
