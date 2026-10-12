import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  PropertyStatus,
  Role,
  TransactionPurpose,
  TransactionStatus,
  type Transaction,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import type { PaymentInitiatedDto } from './dto/payment-response.dto.js';
import { HesabPayGateway, type VerifiedWebhookEvent } from './gateway/hesabpay-gateway.js';
import { HESABPAY_SETTINGS, type HesabPaySettings } from './hesabpay.config.js';
import { fulfil } from './hesabpay.fulfilment.js';

/** What a payment request resolves to once the caller's right to make it is checked. */
interface PaymentTarget {
  purpose: TransactionPurpose;
  amount: string;
  description: string;
  agencyId?: string;
  packageType?: Transaction['packageType'];
  propertyId?: string;
}

@Injectable()
export class HesabpayService {
  private readonly logger = new Logger(HesabpayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: HesabPayGateway,
    @Inject(HESABPAY_SETTINGS) private readonly settings: HesabPaySettings,
  ) {}

  /** Starts a payment: records it as PENDING and returns the URL where the user pays. */
  async initiate(userId: string, input: InitiatePaymentDto): Promise<PaymentInitiatedDto> {
    const target = await this.resolveTarget(userId, input);

    // Our id goes to HesabPay as the reference, then the row is written with the session id it
    // returns. If the write fails the session is simply never paid, so nothing is lost.
    const transactionId = randomUUID();
    const session = await this.gateway.createSession({
      reference: transactionId,
      amount: target.amount,
      currency: this.settings.currency,
      description: target.description,
    });

    const payment = await this.prisma.transaction.create({
      data: {
        id: transactionId,
        userId,
        amount: target.amount,
        currency: this.settings.currency,
        hesabpayTxId: session.id,
        purpose: target.purpose,
        status: TransactionStatus.PENDING,
        agencyId: target.agencyId,
        packageType: target.packageType,
        propertyId: target.propertyId,
      },
    });

    return {
      id: payment.id,
      purpose: payment.purpose,
      status: payment.status,
      amount: payment.amount.toNumber(),
      currency: this.settings.currency,
      created_at: payment.createdAt.toISOString(),
      payment_url: session.paymentUrl,
    };
  }

  /**
   * Applies a webhook that has ALREADY passed signature verification.
   *
   * Safe to call any number of times, concurrently, for the same payment: the PENDING -> SUCCESS
   * flip is a single conditional UPDATE inside the transaction that also delivers the goods, so
   * exactly one caller delivers and every other one becomes a no-op.
   */
  async handleWebhook(event: VerifiedWebhookEvent): Promise<void> {
    const payment = await this.prisma.transaction.findUnique({
      where: { hesabpayTxId: event.sessionId },
    });
    if (!payment) {
      // A genuine, signed event for a payment we have no record of. Acknowledge (retrying can't
      // help) but make it loud: someone may have paid for something we never delivered.
      this.logger.error(`Verified webhook for unknown HesabPay transaction "${event.sessionId}"`);
      return;
    }
    if (payment.status !== TransactionStatus.PENDING) {
      this.logger.log(`Ignoring ${event.status} webhook for already ${payment.status} payment ${payment.id}`);
      return;
    }

    if (event.status === 'FAILED') {
      await this.prisma.transaction.updateMany({
        where: { id: payment.id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.FAILED },
      });
      return;
    }

    // Never deliver on an event that disagrees with what we asked HesabPay to charge.
    const mismatch = this.describeMismatch(payment, event);
    if (mismatch) {
      this.logger.error(`Not fulfilling payment ${payment.id}: ${mismatch}. Left PENDING for review.`);
      return;
    }

    await this.prisma.$transaction(async (db) => {
      const claimed = await db.transaction.updateMany({
        where: { id: payment.id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.SUCCESS },
      });
      if (claimed.count !== 1) return; // another delivery of the same webhook won the race
      await fulfil(db, payment, this.settings.featuredAdDays, new Date());
    });
    this.logger.log(`Payment ${payment.id} (${payment.purpose}) fulfilled`);
  }

  private describeMismatch(payment: Transaction, event: VerifiedWebhookEvent): string | null {
    if (event.amount !== undefined && !new Prisma.Decimal(event.amount).equals(payment.amount)) {
      return `webhook amount ${event.amount} != expected ${payment.amount.toString()}`;
    }
    if (event.currency !== undefined && !sameCurrency(event.currency, payment.currency)) {
      return `webhook currency ${event.currency} != expected ${payment.currency}`;
    }
    return null;
  }

  private async resolveTarget(userId: string, input: InitiatePaymentDto): Promise<PaymentTarget> {
    switch (input.purpose) {
      case 'SUBSCRIPTION': {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, agency: { select: { id: true } } },
        });
        if (!user) throw new UnauthorizedException();
        if (user.role !== Role.AGENCY || !user.agency) {
          throw new ForbiddenException({
            message: 'Only registered agencies can buy a subscription.',
            code: 'AGENCY_PROFILE_REQUIRED',
          });
        }
        return {
          purpose: TransactionPurpose.SUBSCRIPTION,
          amount: this.settings.prices.subscription[input.package_type],
          description: `Bongah agency subscription (${input.package_type})`,
          agencyId: user.agency.id,
          packageType: input.package_type,
        };
      }
      case 'LADDER':
      case 'FEATURED_AD': {
        const property = await this.prisma.property.findUnique({
          where: { id: input.property_id },
          select: { userId: true, status: true },
        });
        if (!property || property.status !== PropertyStatus.ACTIVE) {
          throw new NotFoundException('Active property not found.');
        }
        if (property.userId !== userId) {
          throw new ForbiddenException('You can only promote your own listings.');
        }
        const ladder = input.purpose === 'LADDER';
        return {
          purpose: ladder ? TransactionPurpose.LADDER : TransactionPurpose.FEATURED_AD,
          amount: ladder ? this.settings.prices.ladder : this.settings.prices.featuredAd,
          description: ladder ? 'Bongah listing ladder' : 'Bongah featured listing',
          propertyId: input.property_id,
        };
      }
    }
  }
}

/** Providers say "AFN"; we store "AFGHANI". */
function sameCurrency(fromProvider: string, ours: string): boolean {
  const normalise = (code: string) => (code.toUpperCase() === 'AFN' ? 'AFGHANI' : code.toUpperCase());
  return normalise(fromProvider) === normalise(ours);
}
