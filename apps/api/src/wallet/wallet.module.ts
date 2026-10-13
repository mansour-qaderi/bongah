import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module.js';
import { HesabpayModule } from '../hesabpay/hesabpay.module.js';
import { MapLocationModule } from '../map-location/map-location.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [AuthModule, HesabpayModule, MapLocationModule, ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
