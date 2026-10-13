import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Paginated, PropertyImageItem, PropertyImageUploaded } from '@bongah/shared-types';
import { propertyImagesQuerySchema, type PropertyImagesQuery } from '@bongah/validation';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { readBody, tooLarge } from '../common/upload.js';
import { PropertyImagesService } from './property-images.service.js';

/**
 * Listing photos. The upload is the raw file as the request body (Content-Type: image/jpeg ...), like
 * chat pictures. The answer carries the photo's public URL: put it in a listing's `images`.
 */
@Controller('property-images')
@UseGuards(ThrottlerGuard)
export class PropertyImagesController {
  constructor(private readonly images: PropertyImagesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async upload(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<PropertyImageUploaded> {
    // Check the type BEFORE touching the body: a JSON body is consumed by Express's own parser
    // before it gets here, and waiting for bytes that already went by would hang the request.
    this.images.assertDeclaredType(req.headers['content-type']);
    const { maxBytes } = await this.images.limitsFor(user.id);

    // A client that announces a too-large file is turned away before it sends any of it.
    const announced = Number(req.headers['content-length']);
    if (Number.isFinite(announced) && announced > maxBytes) throw tooLarge(maxBytes);

    const data = await readBody(req, maxBytes);
    return this.images.upload(user.id, req.headers['content-type'], data);
  }

  // Declared before ':id' so "mine" is never read as an id.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(propertyImagesQuerySchema)) query: PropertyImagesQuery,
  ): Promise<Paginated<PropertyImageItem>> {
    return this.images.listMine(user.id, query);
  }

  /** The photo itself. Public (listings are), so an <img> tag can load it. */
  @Get(':id')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { contentType, data } = await this.images.download(id);
    // (Headers are set by hand: with @Res() Nest leaves the response to us.)
    res
      .set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      })
      .type(contentType)
      .send(data);
  }

  /** Deletes one of my photos (refused while a listing uses it). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.images.remove(user.id, id);
  }
}
