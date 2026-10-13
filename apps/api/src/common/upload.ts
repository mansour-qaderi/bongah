import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/** 413 for a picture over the account's size limit. */
export function tooLarge(maxBytes: number): PayloadTooLargeException {
  return new PayloadTooLargeException({
    message: `The picture is larger than ${(maxBytes / 1_000_000).toFixed(1)} MB.`,
    code: 'IMAGE_TOO_LARGE',
    max_bytes: maxBytes,
  });
}

/**
 * Reads a raw-body upload (the file itself as the request body, not a multipart form), giving up
 * without buffering the rest as soon as it exceeds `max` bytes.
 */
export function readBody(req: Request, max: number): Promise<Buffer> {
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
