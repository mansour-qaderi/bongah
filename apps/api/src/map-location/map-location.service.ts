import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { MapLocationStatus } from '@bongah/shared-types';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { unlimitedMapLocationReason } from './map-location.access.js';
import { claimMapLocationToken, countAvailableTokens } from './map-location.tokens.js';

@Injectable()
export class MapLocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** What the signed-in user can do right now. The app reads this before showing the map picker. */
  async getStatus(userId: string): Promise<MapLocationStatus> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new UnauthorizedException();

    const [reason, tokens] = await Promise.all([
      unlimitedMapLocationReason(this.prisma, userId, user.role, now),
      countAvailableTokens(this.prisma, userId),
    ]);
    return { unlimited: reason !== null, unlimited_reason: reason, tokens_available: tokens };
  }

  /**
   * Pays for putting an exact pin on `propertyId`, or refuses. Call it INSIDE the transaction that
   * writes the coordinates: if this throws, the coordinates are rolled back with everything else.
   *
   * `role` must be the role as stored in the database (not the JWT's copy).
   */
  async chargeForPin(
    db: Prisma.TransactionClient,
    userId: string,
    role: Role,
    propertyId: string,
    now: Date,
  ): Promise<void> {
    if (await unlimitedMapLocationReason(db, userId, role, now)) return;
    if (await claimMapLocationToken(db, userId, propertyId, now)) return;

    throw new ForbiddenException({
      message:
        'Placing an exact map location needs an active agency subscription or a Map Location add-on.',
      code: 'MAP_LOCATION_REQUIRED',
    });
  }
}
