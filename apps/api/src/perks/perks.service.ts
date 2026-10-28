import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { PerkReason } from '@bongah/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { isTrialRunning } from '../agencies/trial.js';
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

  /**
   * Whether the user is an agency whose free trial is running. A trial is not the perks (no unlimited contact reveals,
   * no chat tools): routes that opt in with RequiresPerks({ orTrial: true }) are the ones that let it through.
   */
  async inTrial(userId: string, now: Date = new Date()): Promise<boolean> {
    const agency = await this.prisma.agency.findUnique({
      where: { userId },
      select: { trialEndsAt: true, user: { select: { role: true } } },
    });
    return agency?.user.role === 'AGENCY' && isTrialRunning(agency.trialEndsAt, now);
  }
}
