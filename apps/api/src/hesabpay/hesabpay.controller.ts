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
import {
  paginationQuerySchema,
  pricingQuerySchema,
  submitPaymentReferenceSchema,
  type PaginationQuery,
  type PricingQuery,
  type SubmitPaymentReferenceInput,
} from '@bongah/validation';
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
import { readBody, tooLarge } from '../common/upload.js';
import { HesabpayService } from './hesabpay.service.js';
import { ManualPaymentsService } from './manual-payments.service.js';

@Controller('hesabpay')
@UseGuards(ThrottlerGuard)
export class HesabpayController {
  private readonly logger = new Logger(HesabpayController.name);

  constructor(
    private readonly hesabpay: HesabpayService,
    private readonly manualPayments: ManualPaymentsService,
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

  /** Current prices (public). `?market=IR` for Iran's (409 MARKET_PAYMENTS_UNAVAILABLE when none are set); Afghanistan's otherwise. */
  @Get('pricing')
  pricing(@Query(new ZodValidationPipe(pricingQuerySchema)) query: PricingQuery): Promise<PricingDto> {
    return this.hesabpay.getPricing(query.market);
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

  /**
   * Uploads the picture of the transfer receipt for one of my manual payments (the file itself as the request body,
   * Content-Type: image/jpeg, image/png or image/webp), replacing an earlier one. An admin looks at it and confirms the payment.
   */
  @Post('payments/:id/proof')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async uploadProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<PaymentStatusDto> {
    // Check the type BEFORE touching the body, and turn away an announced oversize file before it is sent: the same
    // order as the chat pictures (a JSON body is consumed by Express's parser before it gets here).
    this.manualPayments.assertDeclaredType(req.headers['content-type']);
    const max = this.manualPayments.maxBytes;
    const announced = Number(req.headers['content-length']);
    if (Number.isFinite(announced) && announced > max) throw tooLarge(max);
    const data = await readBody(req, max);
    return this.manualPayments.uploadProof(user.id, id, req.headers['content-type'], data);
  }

  /**
   * Sends the transaction id printed on the transfer receipt for one of my manual payments, instead of (or besides) the
   * picture. Sending it again replaces the earlier one while the payment is still waiting.
   */
  @Post('payments/:id/reference')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submitReference(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitPaymentReferenceSchema)) body: SubmitPaymentReferenceInput,
  ): Promise<PaymentStatusDto> {
    return this.manualPayments.submitReference(user.id, id, body.reference);
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
