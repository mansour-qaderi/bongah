import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module.js';
import { DevicesService } from './devices.service.js';
import { FcmPushGateway } from './fcm-push.gateway.js';
import { MockPushGateway } from './mock-push.gateway.js';
import { MorningPushScheduler } from './morning-push.scheduler.js';
import { MorningPushService } from './morning-push.service.js';
import { NotificationController, QuotesController } from './notification.controller.js';
import { NOTIFICATION_SETTINGS, readNotificationSettings, type NotificationSettings } from './notification.config.js';
import { DisabledPushGateway, PUSH_GATEWAY, type PushGateway } from './push.gateway.js';
import { QuotesService } from './quotes.service.js';

function createPushGateway(settings: NotificationSettings): PushGateway {
  if (settings.provider === 'fcm' && settings.fcm) return new FcmPushGateway(settings.fcm);
  if (settings.provider === 'mock') return new MockPushGateway();
  return new DisabledPushGateway();
}

/**
 * The first-launch welcome card's text, phones that can be pushed, and the daily morning quote push.
 * The admin side (quote templates, a test push, send statistics) lives in AdminModule and uses the services exported here.
 */
@Module({
  imports: [AuthModule, ScheduleModule.forRoot()],
  controllers: [QuotesController, NotificationController],
  providers: [
    { provide: NOTIFICATION_SETTINGS, inject: [ConfigService], useFactory: readNotificationSettings },
    { provide: PUSH_GATEWAY, inject: [NOTIFICATION_SETTINGS], useFactory: createPushGateway },
    QuotesService,
    DevicesService,
    MorningPushService,
    MorningPushScheduler,
  ],
  exports: [QuotesService, MorningPushService, PUSH_GATEWAY],
})
export class NotificationModule {}
