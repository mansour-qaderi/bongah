import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { Agency } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AgenciesService } from './agencies.service.js';
import { registerAgencySchema, type RegisterAgencyDto } from './dto/register-agency.dto.js';

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
}
