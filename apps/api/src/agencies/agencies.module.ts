import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { PerksModule } from '../perks/perks.module.js';
import { PropertyModule } from '../property/property.module.js';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';
import { AgencyAnalyticsService } from './agency-analytics.service.js';
import { AgencyBulkService } from './agency-bulk.service.js';

@Module({
  imports: [AuthModule, PerksModule, PropertyModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [AgenciesController],
  providers: [AgenciesService, AgencyAnalyticsService, AgencyBulkService],
})
export class AgenciesModule {}
