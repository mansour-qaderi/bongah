import { Module } from '@nestjs/common';
import { PromotionService } from './promotion.service.js';

@Module({
  providers: [PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
