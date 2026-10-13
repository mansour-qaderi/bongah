import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PerkReason } from '@bongah/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { accountPerkReason } from './perks.access.js';

@Injectable()
export class PerksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Why the user currently has the agency perks, or null. Reads the role from the database. */
  async reasonFor(userId: string, now: Date = new Date()): Promise<PerkReason | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new UnauthorizedException();
    return accountPerkReason(this.prisma, userId, user.role, now);
  }
}
