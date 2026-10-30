import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { FeedbackReceived, MyFeedbackItem } from '@bongah/shared-types';
import { createFeedbackSchema, type CreateFeedbackInput } from '@bongah/validation';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { FeedbackService } from './feedback.service.js';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** A suggestion, a problem or a thank-you for the Bongah team, from the app's Account tab. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFeedbackSchema)) body: CreateFeedbackInput,
  ): Promise<FeedbackReceived> {
    return this.feedback.create(user.id, body);
  }

  /** What I wrote and what the team answered. */
  @Get('mine')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyFeedbackItem[]> {
    return this.feedback.mine(user.id);
  }
}
