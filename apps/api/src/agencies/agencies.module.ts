import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AgenciesController],
  providers: [AgenciesService],
})
export class AgenciesModule {}
