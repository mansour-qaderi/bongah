import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { SpendLaddersResponse } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { spendLaddersSchema, type SpendLaddersDto } from './dto/spend-ladders.dto.js';
import { RewardsService } from './rewards.service.js';

@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  /** Spend ladders on one more listing (3; free ones used up) or on a featured frame for one of my listings (7). */
  @Post('ladders/spend')
  @HttpCode(HttpStatus.OK)
  spend(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(spendLaddersSchema)) body: SpendLaddersDto,
  ): Promise<SpendLaddersResponse> {
    return this.rewards.spendLadders(user.id, body);
  }
}
