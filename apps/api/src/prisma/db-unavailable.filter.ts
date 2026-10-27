import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { isTransientDbError } from './prisma.transient.js';

/**
 * A database that cannot be reached is not a bug in the request: answer 503 with a code the panel and the app can
 * show ("try again in a few seconds") instead of an anonymous 500. Everything else goes to Nest's normal handling,
 * untouched (HTTP exceptions keep their status and body; unknown errors still become a logged 500).
 */
@Catch()
export class DbUnavailableFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Database');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.getType() === 'http' ? host.switchToHttp().getResponse<Response>() : null;
    if (!response || response.headersSent || !isTransientDbError(exception)) {
      super.catch(exception, host);
      return;
    }
    this.log.error(`Database unreachable: ${exception instanceof Error ? exception.message : String(exception)}`);
    response.setHeader('Retry-After', '5');
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'The database is temporarily unreachable. Try again in a few seconds.',
      code: 'DATABASE_UNAVAILABLE',
      retry_after: 5,
    });
  }
}
