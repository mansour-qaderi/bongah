import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  AbuseReportItem,
  AdminAgencyItem,
  AdminAuditEntry,
  AdminOverview,
  AdminPropertyItem,
  AdminTransactionItem,
  AdminUserDetail,
  AdminUserItem,
  Banner,
  DailyQuote,
  MorningPushDay,
  Paginated,
  PricingEntry,
  TestPushResult,
} from '@bongah/shared-types';
import {
  adminAgenciesQuerySchema,
  adminAuditQuerySchema,
  adminPropertiesQuerySchema,
  adminQuotesQuerySchema,
  adminReportsQuerySchema,
  adminTransactionsQuerySchema,
  adminUsersQuerySchema,
  analyticsQuerySchema,
  banUserSchema,
  createBannerSchema,
  createQuoteSchema,
  featureListingSchema,
  removeListingSchema,
  resolveReportSchema,
  reviewAgencySchema,
  setPricingSchema,
  updateBannerSchema,
  updateQuoteSchema,
  type AdminAgenciesQuery,
  type AdminAuditQuery,
  type AdminPropertiesQuery,
  type AdminQuotesQuery,
  type AdminReportsQuery,
  type AdminTransactionsQuery,
  type AdminUsersQuery,
  type AnalyticsQuery,
  type BanUserInput,
  type CreateBannerInput,
  type CreateQuoteInput,
  type FeatureListingInput,
  type RemoveListingInput,
  type ResolveReportInput,
  type ReviewAgencyInput,
  type SetPricingInput,
  type UpdateBannerInput,
  type UpdateQuoteInput,
} from '@bongah/validation';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { BannersService } from '../banners/banners.service.js';
import { PricingKey } from '../generated/prisma/client.js';
import { PricingService } from '../hesabpay/pricing.service.js';
import { BansService } from '../moderation/bans.service.js';
import { ReportsService } from '../moderation/reports.service.js';
import { MorningPushService } from '../notification/morning-push.service.js';
import { QuotesService } from '../notification/quotes.service.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { AdminAnalyticsService } from './admin-analytics.service.js';
import { AdminOnly } from './admin-only.decorator.js';
import { AdminPropertiesService } from './admin-properties.service.js';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { AdminUsersService } from './admin-users.service.js';

// Every controller here is AdminOnly: a signed-in, not-banned account whose role in the database is ADMIN.
// Mutations answer with the changed record so the panel can update its row without another request.

@Controller('admin/analytics')
@AdminOnly()
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  /** Revenue, listings, user growth, payments and the moderation backlog. */
  @Get('overview')
  overview(@Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery): Promise<AdminOverview> {
    return this.analytics.overview(query.days);
  }
}

@Controller('admin/users')
@AdminOnly()
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly bans: BansService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminUsersQuerySchema)) query: AdminUsersQuery): Promise<Paginated<AdminUserItem>> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetail> {
    return this.users.get(id);
  }

  /** Suspends the account: no sign-in, no API access, chat connections cut, listings hidden. Nothing is deleted. */
  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  async ban(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(banUserSchema)) body: BanUserInput,
  ): Promise<AdminUserDetail> {
    await this.bans.ban(admin.id, id, body.reason);
    return this.users.get(id);
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  async unban(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetail> {
    await this.bans.unban(admin.id, id);
    return this.users.get(id);
  }
}

@Controller('admin/reports')
@AdminOnly()
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminReportsQuerySchema)) query: AdminReportsQuery,
  ): Promise<Paginated<AbuseReportItem>> {
    return this.reports.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AbuseReportItem> {
    return this.reports.get(id);
  }

  /** Decides an open report: dismiss it, mark it handled, ban the reported account, or remove the reported listing. */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) body: ResolveReportInput,
  ): Promise<AbuseReportItem> {
    return this.reports.resolve(admin.id, id, body);
  }
}

@Controller('admin/agencies')
@AdminOnly()
export class AdminAgenciesController {
  constructor(private readonly agencies: AdminAgenciesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminAgenciesQuerySchema)) query: AdminAgenciesQuery,
  ): Promise<Paginated<AdminAgencyItem>> {
    return this.agencies.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminAgencyItem> {
    return this.agencies.get(id);
  }

  /** Approves or rejects the agency's business documents (a rejection must say why). */
  @Put(':id/verification')
  review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewAgencySchema)) body: ReviewAgencyInput,
  ): Promise<AdminAgencyItem> {
    return this.agencies.review(admin.id, id, body);
  }
}

@Controller('admin/properties')
@AdminOnly()
export class AdminPropertiesController {
  constructor(private readonly properties: AdminPropertiesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminPropertiesQuerySchema)) query: AdminPropertiesQuery,
  ): Promise<Paginated<AdminPropertyItem>> {
    return this.properties.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminPropertyItem> {
    return this.properties.get(id);
  }

  /** Gives the listing a featured badge for N days, free of charge. */
  @Post(':id/feature')
  @HttpCode(HttpStatus.OK)
  feature(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(featureListingSchema)) body: FeatureListingInput,
  ): Promise<AdminPropertyItem> {
    return this.properties.feature(admin.id, id, body.days);
  }

  /** Ends the featured badge now. */
  @Delete(':id/feature')
  unfeature(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<AdminPropertyItem> {
    return this.properties.unfeature(admin.id, id);
  }

  /** Takes the listing down; its owner cannot bring it back. */
  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(removeListingSchema)) body: RemoveListingInput,
  ): Promise<AdminPropertyItem> {
    return this.properties.remove(admin.id, id, body.reason);
  }

  /** Brings a taken-down listing back (as active). */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<AdminPropertyItem> {
    return this.properties.restore(admin.id, id);
  }
}

@Controller('admin/transactions')
@AdminOnly()
export class AdminTransactionsController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  /** The HesabPay transaction log. */
  @Get()
  list(
    @Query(new ZodValidationPipe(adminTransactionsQuerySchema)) query: AdminTransactionsQuery,
  ): Promise<Paginated<AdminTransactionItem>> {
    return this.transactions.list(query);
  }
}

@Controller('admin/audit-log')
@AdminOnly()
export class AdminAuditController {
  constructor(private readonly transactions: AdminTransactionsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminAuditQuerySchema)) query: AdminAuditQuery): Promise<Paginated<AdminAuditEntry>> {
    return this.transactions.auditLog(query);
  }
}

@Controller('admin/banners')
@AdminOnly()
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  list(): Promise<Banner[]> {
    return this.banners.listAll();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBannerSchema)) body: CreateBannerInput,
  ): Promise<Banner> {
    return this.banners.create(admin.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBannerSchema)) body: UpdateBannerInput,
  ): Promise<Banner> {
    return this.banners.update(admin.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.banners.remove(admin.id, id);
  }
}

@Controller('admin/pricing')
@AdminOnly()
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  /** Every paid product with its current price, the environment default, and whether an admin changed it. */
  @Get()
  list(): Promise<PricingEntry[]> {
    return this.pricing.list();
  }

  /** Sets the price (and featured days / credits per pack) of one product. Affects payments started from now on. */
  @Put(':key')
  set(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key', new ParseEnumPipe(PricingKey)) key: PricingKey,
    @Body(new ZodValidationPipe(setPricingSchema)) body: SetPricingInput,
  ): Promise<PricingEntry[]> {
    return this.pricing.set(admin.id, key, body);
  }

  /** Back to the environment default. */
  @Delete(':key')
  reset(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key', new ParseEnumPipe(PricingKey)) key: PricingKey,
  ): Promise<PricingEntry[]> {
    return this.pricing.reset(admin.id, key);
  }
}

@Controller('admin/quotes')
@AdminOnly()
export class AdminQuotesController {
  constructor(private readonly quotes: QuotesService) {}

  /** The welcome-card and morning-push texts, newest first. */
  @Get()
  list(@Query(new ZodValidationPipe(adminQuotesQuerySchema)) query: AdminQuotesQuery): Promise<Paginated<DailyQuote>> {
    return this.quotes.list(query);
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(createQuoteSchema)) body: CreateQuoteInput,
  ): Promise<DailyQuote> {
    return this.quotes.create(admin.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateQuoteSchema)) body: UpdateQuoteInput,
  ): Promise<DailyQuote> {
    return this.quotes.update(admin.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() admin: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.quotes.remove(admin.id, id);
  }
}

@Controller('admin/notifications')
@AdminOnly()
export class AdminNotificationsController {
  constructor(private readonly morningPush: MorningPushService) {}

  /** How many users the morning push reached on each of the last 14 Kabul days. */
  @Get('morning')
  morning(): Promise<MorningPushDay[]> {
    return this.morningPush.stats();
  }

  /** Sends a real push to the calling admin's own registered phones: the way to check the Firebase setup. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  test(@CurrentUser() admin: AuthenticatedUser): Promise<TestPushResult> {
    return this.morningPush.sendTest(admin.id);
  }
}
