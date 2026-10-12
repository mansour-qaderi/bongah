import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';

@Module({
  controllers: [AgenciesController],
  providers: [AgenciesService]
})
export class AgenciesModule {}
