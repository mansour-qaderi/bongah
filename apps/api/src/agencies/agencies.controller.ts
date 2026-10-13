import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import type { Agency, AgencyDashboard } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AgenciesService } from './agencies.service.js';
import { registerAgencySchema, type RegisterAgencyDto } from './dto/register-agency.dto.js';
import {
  setAgencyLocationSchema,
  type SetAgencyLocationDto,
} from './dto/set-agency-location.dto.js';

@Controller('agencies')
export class AgenciesController {
  constructor(private readonly agencies: AgenciesService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerAgencySchema)) body: RegisterAgencyDto,
  ): Promise<Agency> {
    return this.agencies.register(user.id, body);
  }

  /** The agency CRM home: listing counts, views, subscription days left, top listings. */
  @Get('me/dashboard')
  @UseGuards(JwtAuthGuard)
  dashboard(@CurrentUser() user: AuthenticatedUser): Promise<AgencyDashboard> {
    return this.agencies.getDashboard(user.id);
  }

  /** The office's exact map pin. Needs an active subscription; no extra fee. */
  @Put('me/location')
  @UseGuards(JwtAuthGuard)
  setLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setAgencyLocationSchema)) body: SetAgencyLocationDto,
  ): Promise<Agency> {
    return this.agencies.setLocation(user.id, body);
  }
}
