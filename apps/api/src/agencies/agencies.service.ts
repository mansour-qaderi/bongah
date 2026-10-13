import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Agency, AgencyDashboard, AgencyMapPin } from '@bongah/shared-types';
import {
  Prisma,
  AgencyVerificationStatus,
  PropertyStatus,
  Role,
  type Agency as AgencyRow,
} from '../generated/prisma/client.js';
import { isFeaturedAt } from '../property/property.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterAgencyDto } from './dto/register-agency.dto.js';
import type { SetAgencyLocationDto } from './dto/set-agency-location.dto.js';
import { DAY_MS, findActiveSubscription, summariseSubscription } from './subscription.js';

const DASHBOARD_TOP_LISTINGS = 5;

/** The most offices one map answer carries. Oldest first, so the answer is stable while the cap is not reached. */
export const AGENCY_MAP_LIMIT = 500;

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verified agency offices that have placed a pin: what the home map draws. Public.
   * An unverified or rejected agency, one without a pin, and one whose account is banned never appear.
   * `active_listings` counts what a visitor could actually open (active listings of an account in good standing).
   */
  async listMapPins(): Promise<AgencyMapPin[]> {
    const rows = await this.prisma.agency.findMany({
      where: {
        verificationStatus: AgencyVerificationStatus.VERIFIED,
        lat: { not: null },
        lng: { not: null },
        user: { bannedAt: null },
      },
      select: {
        id: true,
        agencyName: true,
        address: true,
        lat: true,
        lng: true,
        _count: { select: { properties: { where: { status: PropertyStatus.ACTIVE } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: AGENCY_MAP_LIMIT,
    });
    // The query guarantees both coordinates; the filter lets the compiler know it too.
    return rows.flatMap((row) =>
      row.lat === null || row.lng === null
        ? []
        : [
            {
              id: row.id,
              agency_name: row.agencyName,
              address: row.address,
              lat: row.lat,
              lng: row.lng,
              active_listings: row._count.properties,
            },
          ],
    );
  }

  /**
   * Registers the signed-in user's real-estate office and switches the account to the AGENCY role.
   * The agency starts unverified. Publishing still needs an active subscription.
   * One agency per user; admins cannot be turned into agencies.
   */
  async register(userId: string, input: RegisterAgencyDto): Promise<Agency> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Lock the user row so concurrent registrations queue up behind each other.
        const users = await tx.$queryRaw<{ role: Role }[]>`
          SELECT role::text AS role FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        if (users.length === 0) throw new UnauthorizedException();
        if (users[0].role === Role.ADMIN) {
          throw new ForbiddenException('Admin accounts cannot register an agency.');
        }

        const agency = await tx.agency.create({
          data: {
            userId,
            agencyName: input.agency_name,
            licensePhoto: input.license_photo,
            address: input.address,
            description: input.description ?? null,
          },
        });
        await tx.user.update({ where: { id: userId }, data: { role: Role.AGENCY } });
        return agency;
      });

      return toAgencyDto(row);
    } catch (error) {
      // agencies.user_id is UNIQUE: a second registration for the same user lands here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This account already has an agency.');
      }
      throw error;
    }
  }

  /**
   * Places (or moves) the office's exact pin. Included in the subscription: it needs an active
   * one, with no per-pin fee. After the subscription lapses the stored pin stays, but it can't be
   * changed until the agency renews.
   */
  async setLocation(userId: string, input: SetAgencyLocationDto): Promise<Agency> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const agency = await tx.agency.findUnique({ where: { userId } });
      if (!agency) {
        throw new NotFoundException({
          message: 'Register your agency first.',
          code: 'AGENCY_PROFILE_REQUIRED',
        });
      }
      if (!(await findActiveSubscription(tx, agency.id, now))) {
        throw new ForbiddenException({
          message: 'An active subscription is required to set the office location.',
          code: 'SUBSCRIPTION_REQUIRED',
        });
      }
      const row = await tx.agency.update({
        where: { id: agency.id },
        data: { lat: input.lat, lng: input.lng },
      });
      return toAgencyDto(row);
    });
  }

  /**
   * Sends a new license photo for review. The agency goes back to PENDING (and loses the verified badge
   * until an admin approves the new document): the badge vouches for the document on file, so a
   * replaced document has to be looked at again. Also how a rejected agency resubmits.
   */
  async resubmitLicense(userId: string, licensePhoto: string): Promise<Agency> {
    const updated = await this.prisma.agency.updateMany({
      where: { userId },
      data: {
        licensePhoto,
        verificationStatus: AgencyVerificationStatus.PENDING,
        isVerified: false,
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException({ message: 'Register your agency first.', code: 'AGENCY_PROFILE_REQUIRED' });
    }
    return toAgencyDto(await this.prisma.agency.findUniqueOrThrow({ where: { userId } }));
  }

  /**
   * The numbers on the agency's home screen. "The agency's listings" are the ones published
   * under its agency profile (properties.agency_id); anything the owner posted as a regular user
   * before registering the agency stays out of these figures.
   */
  async getDashboard(userId: string): Promise<AgencyDashboard> {
    const now = new Date();
    const agency = await this.prisma.agency.findUnique({
      where: { userId },
      select: { id: true, agencyName: true, isVerified: true, verificationStatus: true, rejectionReason: true },
    });
    if (!agency) {
      throw new NotFoundException({
        message: 'Register your agency first.',
        code: 'AGENCY_PROFILE_REQUIRED',
      });
    }

    const [byStatus, featuredListings, topListings, plan] = await Promise.all([
      this.prisma.property.groupBy({
        by: ['status'],
        where: { agencyId: agency.id },
        _count: { _all: true },
        _sum: { viewCount: true },
      }),
      this.prisma.property.count({
        where: {
          agencyId: agency.id,
          status: PropertyStatus.ACTIVE,
          isFeatured: true,
          featuredUntil: { gt: now }, // same rule as isFeaturedAt()
        },
      }),
      this.prisma.property.findMany({
        where: { agencyId: agency.id, status: PropertyStatus.ACTIVE },
        orderBy: [{ viewCount: 'desc' }, { ladderedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: DASHBOARD_TOP_LISTINGS,
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          viewCount: true,
          isFeatured: true,
          featuredUntil: true,
          ladderedAt: true,
        },
      }),
      summariseSubscription(this.prisma, agency.id, now),
    ]);

    const countOf = (status: PropertyStatus) =>
      byStatus.find((group) => group.status === status)?._count._all ?? 0;
    const totalViews = byStatus.reduce((sum, group) => sum + (group._sum.viewCount ?? 0), 0);

    let subscription: AgencyDashboard['subscription'] = {
      is_active: false,
      package_type: null,
      ends_at: null,
      remaining_days: 0,
    };
    if (plan.running && plan.until) {
      subscription = {
        is_active: true,
        package_type: plan.running.packageType,
        ends_at: plan.until.toISOString(),
        remaining_days: Math.ceil((plan.until.getTime() - now.getTime()) / DAY_MS),
      };
    }

    return {
      agency: {
        id: agency.id,
        agency_name: agency.agencyName,
        is_verified: agency.isVerified,
        verification_status: agency.verificationStatus,
        rejection_reason: agency.rejectionReason,
      },
      stats: {
        total_properties: countOf(PropertyStatus.ACTIVE) + countOf(PropertyStatus.SOLD),
        active_listings: countOf(PropertyStatus.ACTIVE),
        featured_listings: featuredListings,
        total_views: totalViews,
      },
      subscription,
      top_listings: topListings.map((row) => ({
        id: row.id,
        title: row.title,
        price: row.price.toNumber(),
        currency: row.currency,
        view_count: row.viewCount,
        is_featured: isFeaturedAt(row, now),
        featured_until: row.featuredUntil?.toISOString() ?? null,
        laddered_at: row.ladderedAt?.toISOString() ?? null,
      })),
    };
  }
}

function toAgencyDto(row: AgencyRow): Agency {
  return {
    id: row.id,
    user_id: row.userId,
    agency_name: row.agencyName,
    license_photo: row.licensePhoto,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    is_verified: row.isVerified,
    verification_status: row.verificationStatus,
    rejection_reason: row.rejectionReason,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
