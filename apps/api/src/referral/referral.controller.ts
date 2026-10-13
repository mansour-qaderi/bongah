import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ReferralSummary } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReferralService } from './referral.service.js';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  /** My code, my invite link, the friends who joined with it and the rewards I hold. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<ReferralSummary> {
    return this.referrals.getSummary(user.id);
  }
}
