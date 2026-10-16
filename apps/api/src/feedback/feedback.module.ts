import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  imports: [AuthModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
