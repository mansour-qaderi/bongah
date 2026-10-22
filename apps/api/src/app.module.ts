import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module.js';
import { ContactModule } from './contact/contact.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AgenciesModule } from './agencies/agencies.module.js';
import { PropertyModule } from './property/property.module.js';
import { HesabpayModule } from './hesabpay/hesabpay.module.js';
import { MapLocationModule } from './map-location/map-location.module.js';
import { GeoModule } from './geo/geo.module.js';
import { ReferralModule } from './referral/referral.module.js';
import { AdminModule } from './admin/admin.module.js';
import { BannersModule } from './banners/banners.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { NotificationModule } from './notification/notification.module.js';
import { PropertyImagesModule } from './property-images/property-images.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    MapLocationModule,
    GeoModule,
    PropertyModule,
    HesabpayModule,
    ReferralModule,
    ContactModule,
    ChatModule,
    ModerationModule,
    FeedbackModule,
    BannersModule,
    AdminModule,
    WalletModule,
    PropertyImagesModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
