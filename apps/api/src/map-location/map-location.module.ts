import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MapLocationController } from './map-location.controller.js';
import { MapLocationService } from './map-location.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MapLocationController],
  providers: [MapLocationService],
  exports: [MapLocationService],
})
export class MapLocationModule {}
