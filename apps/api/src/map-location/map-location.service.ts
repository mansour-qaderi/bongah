import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { MapLocationStatus } from '@bongah/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { unlimitedMapLocationReason } from './map-location.access.js';
import { countAvailableTokens } from './map-location.tokens.js';

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
}
