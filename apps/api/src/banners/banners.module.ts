import { Module } from '@nestjs/common';
import { BannersController } from './banners.controller.js';
import { BannersService } from './banners.service.js';

@Module({
  controllers: [BannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
