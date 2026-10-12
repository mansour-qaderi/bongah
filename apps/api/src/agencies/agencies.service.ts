import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Agency } from '@bongah/shared-types';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterAgencyDto } from './dto/register-agency.dto.js';

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
            lat: input.lat,
            lng: input.lng,
            description: input.description ?? null,
          },
        });
        await tx.user.update({ where: { id: userId }, data: { role: Role.AGENCY } });
        return agency;
      });

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
    } catch (error) {
      // agencies.user_id is UNIQUE: a second registration for the same user lands here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This account already has an agency.');
      }
      throw error;
    }
  }
}
