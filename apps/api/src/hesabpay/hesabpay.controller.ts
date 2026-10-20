import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Query,
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
import type { Paginated, PaymentSummary, Receipt } from '@bongah/shared-types';
import { paginationQuerySchema, type PaginationQuery } from '@bongah/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  initiatePaymentSchema,
  useFeaturedCreditSchema,
  type InitiatePaymentDto,
  type UseFeaturedCreditDto,
} from './dto/initiate-payment.dto.js';
import type {
  FeaturedCreditUsedDto,
  PaymentInitiatedDto,
  PaymentStatusDto,
  PricingDto,
  WebhookAckDto,
} from './dto/payment-response.dto.js';
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

  /** Spends one featured-listing credit (bought in a bundle or given as a bonus) on one of my listings. */
  @Post('featured-credits/use')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  useFeaturedCredit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(useFeaturedCreditSchema)) body: UseFeaturedCreditDto,
  ): Promise<FeaturedCreditUsedDto> {
    return this.hesabpay.useFeaturedCredit(user.id, body);
  }

  /** Current prices (public). */
  @Get('pricing')
  pricing(): Promise<PricingDto> {
    return this.hesabpay.getPricing();
  }

  /** My payments, newest first (the wallet's payment history). */
  @Get('payments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  payments(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<Paginated<PaymentSummary>> {
    return this.hesabpay.listPayments(user.id, query);
  }

  /** Status of one of my payments. */
  @Get('payments/:id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  payment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentStatusDto> {
    return this.hesabpay.getPayment(user.id, id);
  }

  /** The digital receipt of one of my successful payments. */
  @Get('payments/:id/receipt')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Receipt> {
    return this.hesabpay.getReceipt(user.id, id);
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
