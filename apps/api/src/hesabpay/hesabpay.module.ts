import { Module } from '@nestjs/common';
import { HesabpayController } from './hesabpay.controller.js';
import { HesabpayService } from './hesabpay.service.js';

@Module({
  controllers: [HesabpayController],
  providers: [HesabpayService]
})
export class HesabpayModule {}
