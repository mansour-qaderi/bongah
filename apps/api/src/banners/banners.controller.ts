import { Controller, Get, Header, Query } from '@nestjs/common';
import type { Banner } from '@bongah/shared-types';
import { publicBannersQuerySchema, type PublicBannersQuery } from '@bongah/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { BannersService } from './banners.service.js';

@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  /** The banners to show now, in display order. Public; a minute of caching is fine for promotional content. */
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  list(@Query(new ZodValidationPipe(publicBannersQuerySchema)) query: PublicBannersQuery): Promise<Banner[]> {
    return this.banners.listPublic(query.placement);
  }
}
