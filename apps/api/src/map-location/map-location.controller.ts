import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MapLocationStatus } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MapLocationService } from './map-location.service.js';

@Controller('map-location')
export class MapLocationController {
  constructor(private readonly mapLocation: MapLocationService) {}

  /** Whether I can pin exact coordinates (unlimited, or how many prepaid pins I have). */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser): Promise<MapLocationStatus> {
    return this.mapLocation.getStatus(user.id);
  }
}
