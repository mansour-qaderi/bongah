import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Agency } from '@bongah/shared-types';
import { Prisma, Role, type Agency as AgencyRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterAgencyDto } from './dto/register-agency.dto.js';
import type { SetAgencyLocationDto } from './dto/set-agency-location.dto.js';
import { findActiveSubscription } from './subscription.js';

@Injectable()
export class AgenciesService {
  constructor(private readonly prisma: PrismaService) {}

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
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
