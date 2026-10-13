import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PromotionModule } from '../promotion/promotion.module.js';
import { ReferralController } from './referral.controller.js';
import { ReferralService } from './referral.service.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

/**
 * Referral codes and the rewards they earn. Granting rewards at signup is NOT here: it lives in
 * referral.signup.ts as plain functions that AuthService calls, because this module imports
 * AuthModule (for the guard) and the reverse import would be circular.
 */
@Module({
  imports: [AuthModule, PromotionModule],
  controllers: [ReferralController, RewardsController],
  providers: [ReferralService, RewardsService],
})
export class ReferralModule {}
