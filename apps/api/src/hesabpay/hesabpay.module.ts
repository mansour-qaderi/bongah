import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { PromotionModule } from '../promotion/promotion.module.js';
import { HesabPayGateway } from './gateway/hesabpay-gateway.js';
import { LiveHesabPayGateway } from './gateway/live-hesabpay.gateway.js';
import { MockHesabPayGateway } from './gateway/mock-hesabpay.gateway.js';
import { HESABPAY_SETTINGS, readHesabPaySettings, type HesabPaySettings } from './hesabpay.config.js';
import { HesabpayController } from './hesabpay.controller.js';
import { HesabpayService } from './hesabpay.service.js';
import { PricingService } from './pricing.service.js';

@Module({
  imports: [AuthModule, PromotionModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [HesabpayController],
  providers: [
    HesabpayService,
    PricingService,
    {
      provide: HESABPAY_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): HesabPaySettings => readHesabPaySettings(config),
    },
    {
      provide: HesabPayGateway,
      inject: [HESABPAY_SETTINGS],
      useFactory: (settings: HesabPaySettings): HesabPayGateway =>
        settings.mode === 'live' ? new LiveHesabPayGateway(settings) : new MockHesabPayGateway(settings),
    },
  ],
  exports: [HesabpayService, PricingService],
})
export class HesabpayModule {}
