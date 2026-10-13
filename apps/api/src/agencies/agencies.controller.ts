import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Agency, AgencyAnalytics, AgencyDashboard, BulkResponse, Property } from '@bongah/shared-types';
import {
  analyticsQuerySchema,
  bulkCreatePropertiesSchema,
  bulkUpdatePropertiesSchema,
  resubmitLicenseSchema,
  type AnalyticsQuery,
  type BulkCreatePropertiesInput,
  type BulkUpdatePropertiesInput,
  type ResubmitLicenseInput,
} from '@bongah/validation';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PerksGuard, RequiresPerks } from '../perks/perks.guard.js';
import { AgenciesService } from './agencies.service.js';
import { AgencyAnalyticsService } from './agency-analytics.service.js';
import { AgencyBulkService } from './agency-bulk.service.js';
import { registerAgencySchema, type RegisterAgencyDto } from './dto/register-agency.dto.js';
import {
  setAgencyLocationSchema,
  type SetAgencyLocationDto,
} from './dto/set-agency-location.dto.js';

@Controller('agencies')
export class AgenciesController {
  constructor(
    private readonly agencies: AgenciesService,
    private readonly analytics: AgencyAnalyticsService,
    private readonly bulk: AgencyBulkService,
  ) {}

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

  /** Sends a new license photo for review (also how a rejected agency resubmits). Resets the review to PENDING. */
  @Put('me/license')
  @UseGuards(JwtAuthGuard)
  resubmitLicense(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(resubmitLicenseSchema)) body: ResubmitLicenseInput,
  ): Promise<Agency> {
    return this.agencies.resubmitLicense(user.id, body.license_photo);
  }

  /** Views, leads and phone reveals over the last N Kabul days, per day and per listing. */
  @Get('me/analytics')
  @UseGuards(JwtAuthGuard)
  analyticsOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AgencyAnalytics> {
    return this.analytics.get(user.id, query.days);
  }

  /**
   * Publishes up to 50 listings in one request. Needs the agency perks (active subscription). Always
   * answers 200 with one result per row: check `failed`, not the status code.
   */
  @Post('me/properties/bulk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PerksGuard, ThrottlerGuard)
  @RequiresPerks()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(bulkCreatePropertiesSchema)) body: BulkCreatePropertiesInput,
  ): Promise<BulkResponse<Property>> {
    return this.bulk.create(user.id, body.items);
  }

  /** Edits up to 50 listings in one request (price, status, anything PATCH /properties/:id accepts). One result per row. */
  @Patch('me/properties/bulk')
  @UseGuards(JwtAuthGuard, PerksGuard, ThrottlerGuard)
  @RequiresPerks()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  bulkUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(bulkUpdatePropertiesSchema)) body: BulkUpdatePropertiesInput,
  ): Promise<BulkResponse<Property>> {
    return this.bulk.update(user.id, body.items);
  }
}
