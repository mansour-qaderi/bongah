import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ChatImageUploaded } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ChatImagesService, tooLarge } from './chat-images.service.js';

/**
 * Chat pictures. The upload is the raw file as the request body (Content-Type: image/jpeg ...),
 * not a multipart form: no extra upload library, and the size limit is enforced WHILE reading,
 * so an oversized file is never held in memory.
 */
@Controller('chat/images')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class ChatImagesController {
  constructor(private readonly images: ChatImagesService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async upload(@CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<ChatImageUploaded> {
    // Check the type BEFORE touching the body: a JSON body is consumed by Express's own parser
    // before it gets here, and waiting for bytes that already went by would hang the request.
    this.images.assertDeclaredType(req.headers['content-type']);
    const max = await this.images.maxBytesFor(user.id);

    // A client that announces a too-large file is turned away before it sends any of it.
    const announced = Number(req.headers['content-length']);
    if (Number.isFinite(announced) && announced > max) throw tooLarge(max);

    const data = await readBody(req, max);
    return this.images.upload(user.id, req.headers['content-type'], data);
  }

  /** The picture itself. Needs the access token, so the app passes it as a header on the image request. */
  @Get(':id')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { contentType, data } = await this.images.download(user.id, id);
    // (Headers are set by hand: with @Res() Nest leaves the response to us.)
    res
      .set({
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .type(contentType)
      .send(data);
  }
}

/** Reads the request body, giving up (without buffering the rest) as soon as it exceeds `max` bytes. */
function readBody(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (error: Error | null, result?: Buffer) => {
      if (done) return;
      done = true;
      req.removeAllListeners('data');
      if (error) reject(error);
      else resolve(result ?? Buffer.alloc(0));
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        finish(tooLarge(max));
        req.resume(); // drain and discard the rest so the response can be sent
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(null, Buffer.concat(chunks)));
    req.on('error', () => finish(new BadRequestException('The upload was interrupted.')));
  });
}
