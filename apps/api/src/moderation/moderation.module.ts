import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { BansService } from './bans.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  // ChatModule exports the event bus that closes a banned person's live chat connections.
  imports: [AuthModule, ChatModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [ReportsController],
  providers: [BansService, ReportsService],
  exports: [BansService, ReportsService],
})
export class ModerationModule {}
