import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BannersModule } from '../banners/banners.module.js';
import { HesabpayModule } from '../hesabpay/hesabpay.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PromotionModule } from '../promotion/promotion.module.js';
import { AdminAgenciesService } from './admin-agencies.service.js';
import { AdminAnalyticsService } from './admin-analytics.service.js';
import { AdminFeedbackService } from './admin-feedback.service.js';
import { AdminPropertiesService } from './admin-properties.service.js';
import { AdminTransactionsService } from './admin-transactions.service.js';
import { AdminUsersService } from './admin-users.service.js';
import {
  AdminAgenciesController,
  AdminAnalyticsController,
  AdminAuditController,
  AdminBannersController,
  AdminFeedbackController,
  AdminNotificationsController,
  AdminPricingController,
  AdminPropertiesController,
  AdminQuotesController,
  AdminReportsController,
  AdminTransactionsController,
  AdminUsersController,
} from './admin.controllers.js';

/** The back office: everything under /admin. Each controller is limited to accounts whose role in the database is ADMIN. */
@Module({
  imports: [AuthModule, ModerationModule, BannersModule, HesabpayModule, PromotionModule, NotificationModule],
  controllers: [
    AdminAnalyticsController,
    AdminUsersController,
    AdminReportsController,
    AdminAgenciesController,
    AdminPropertiesController,
    AdminTransactionsController,
    AdminAuditController,
    AdminBannersController,
    AdminFeedbackController,
    AdminPricingController,
    AdminQuotesController,
    AdminNotificationsController,
  ],
  providers: [
    AdminUsersService,
    AdminAgenciesService,
    AdminPropertiesService,
    AdminTransactionsService,
    AdminAnalyticsService,
    AdminFeedbackService,
  ],
})
export class AdminModule {}
