import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { IncomingHttpHeaders } from 'node:http';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { initiatePaymentSchema, type InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import type { PaymentInitiatedDto, WebhookAckDto } from './dto/payment-response.dto.js';
import { HesabPayGateway } from './gateway/hesabpay-gateway.js';
import { HesabpayService } from './hesabpay.service.js';

@Controller('hesabpay')
@UseGuards(ThrottlerGuard)
export class HesabpayController {
  private readonly logger = new Logger(HesabpayController.name);

  constructor(
    private readonly hesabpay: HesabpayService,
    private readonly gateway: HesabPayGateway,
  ) {}

  /** Starts a payment for a subscription, a ladder bump or a featured listing. The server sets the price. */
  @Post('payments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(initiatePaymentSchema)) body: InitiatePaymentDto,
  ): Promise<PaymentInitiatedDto> {
    return this.hesabpay.initiate(user.id, body);
  }

  /**
   * HesabPay's payment confirmation. Public (HesabPay cannot hold our JWT), so authenticity rests
   * entirely on the gateway's signature check, which runs on the exact bytes received before
   * anything else is looked at. 401 = not authentic; 2xx = accepted (also for repeats).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<WebhookAckDto> {
    if (!request.rawBody) {
      // Misconfiguration (app created without { rawBody: true }). Fail closed, loudly.
      this.logger.error('Webhook received but the raw body is unavailable: enable rawBody in main.ts');
      throw new InternalServerErrorException();
    }

    const event = await this.gateway.verifyWebhook({ rawBody: request.rawBody, headers });
    await this.hesabpay.handleWebhook(event);
    return { received: true };
  }
}
