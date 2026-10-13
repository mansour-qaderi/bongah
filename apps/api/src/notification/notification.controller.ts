import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Put, Query, UseGuards } from '@nestjs/common';
import type { WelcomeQuote } from '@bongah/shared-types';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  registerDeviceSchema,
  removeDeviceSchema,
  welcomeQuoteQuerySchema,
  type RegisterDeviceInput,
  type RemoveDeviceInput,
  type WelcomeQuoteQuery,
} from '@bongah/validation';
import { DevicesService } from './devices.service.js';
import { QuotesService } from './quotes.service.js';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  /** The text for the first-launch welcome card. 404 NO_ACTIVE_QUOTE means: show the app's built-in text. */
  @Get('welcome')
  @Header('Cache-Control', 'no-store')
  welcome(@Query(new ZodValidationPipe(welcomeQuoteQuerySchema)) query: WelcomeQuoteQuery): Promise<WelcomeQuote> {
    return this.quotes.randomWelcome(query.language);
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly devices: DevicesService) {}

  /** The app calls this on start (and when Firebase rotates the token) so the morning push can reach this phone. */
  @Put('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerDeviceSchema)) body: RegisterDeviceInput,
  ): Promise<void> {
    return this.devices.register(user.id, body);
  }

  /** Sign-out: this phone stops receiving this account's pushes. */
  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(removeDeviceSchema)) body: RemoveDeviceInput,
  ): Promise<void> {
    return this.devices.remove(user.id, body.token);
  }
}
