import { Module } from '@nestjs/common';
import { PerksGuard } from './perks.guard.js';
import { PerksService } from './perks.service.js';

@Module({
  providers: [PerksService, PerksGuard],
  exports: [PerksService, PerksGuard],
})
export class PerksModule {}
