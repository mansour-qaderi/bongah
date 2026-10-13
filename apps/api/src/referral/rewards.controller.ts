import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { RedeemLadderTokenResponse } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { redeemLadderTokenSchema, type RedeemLadderTokenDto } from './dto/redeem-ladder-token.dto.js';
import { RewardsService } from './rewards.service.js';

@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  /** Spend one free ladder token on one of my listings. */
  @Post('ladder-tokens/redeem')
  @HttpCode(HttpStatus.OK)
  redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(redeemLadderTokenSchema)) body: RedeemLadderTokenDto,
  ): Promise<RedeemLadderTokenResponse> {
    return this.rewards.redeemLadderToken(user.id, body.property_id);
  }
}
