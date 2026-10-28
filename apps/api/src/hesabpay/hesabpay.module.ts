import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { DiskChatImageStorage } from '../chat/images/disk-chat-image.storage.js';
import { PromotionModule } from '../promotion/promotion.module.js';
import { HesabPayGateway } from './gateway/hesabpay-gateway.js';
import { LiveHesabPayGateway } from './gateway/live-hesabpay.gateway.js';
import { ManualHesabPayGateway } from './gateway/manual-hesabpay.gateway.js';
import { MockHesabPayGateway } from './gateway/mock-hesabpay.gateway.js';
import { HESABPAY_SETTINGS, readHesabPaySettings, type HesabPaySettings } from './hesabpay.config.js';
import { HesabpayController } from './hesabpay.controller.js';
import { HesabpayService } from './hesabpay.service.js';
import { ManualPaymentsService, PAYMENT_PROOF_STORAGE } from './manual-payments.service.js';
import { PricingService } from './pricing.service.js';

@Module({
  imports: [AuthModule, PromotionModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [HesabpayController],
  providers: [
    HesabpayService,
    ManualPaymentsService,
    PricingService,
    {
      provide: HESABPAY_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): HesabPaySettings => readHesabPaySettings(config),
    },
    {
      // Receipt pictures are private (an admin and nobody else reads them) and live apart from listing photos.
      provide: PAYMENT_PROOF_STORAGE,
      inject: [HESABPAY_SETTINGS],
      useFactory: (settings: HesabPaySettings) => new DiskChatImageStorage(settings.uploadDir, 'payment-proofs'),
    },
    {
      provide: HesabPayGateway,
      inject: [HESABPAY_SETTINGS],
      useFactory: (settings: HesabPaySettings): HesabPayGateway => {
        if (settings.mode === 'live') return new LiveHesabPayGateway(settings);
        if (settings.mode === 'manual') return new ManualHesabPayGateway();
        return new MockHesabPayGateway(settings);
      },
    },
  ],
  exports: [HesabpayService, ManualPaymentsService, PricingService],
})
export class HesabpayModule {}
