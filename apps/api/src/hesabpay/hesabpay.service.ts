import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Paginated, PaymentSummary, Receipt } from '@bongah/shared-types';
import type { PaginationQuery } from '@bongah/validation';
import {
  Prisma,
  Role,
  TransactionPurpose,
  TransactionStatus,
  type Transaction,
} from '../generated/prisma/client.js';
import { accountPerkReason } from '../perks/perks.access.js';
import { unlimitedMapLocationReason } from '../map-location/map-location.access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionService } from '../promotion/promotion.service.js';
import type { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import type { PaymentInitiatedDto, PaymentStatusDto, PricingDto } from './dto/payment-response.dto.js';
import { HesabPayGateway, type VerifiedWebhookEvent } from './gateway/hesabpay-gateway.js';
import { HESABPAY_SETTINGS, type HesabPaySettings } from './hesabpay.config.js';
import { fulfil } from './hesabpay.fulfilment.js';
import { paymentInclude, toPaymentSummary } from './hesabpay.mapper.js';
import { PricingService } from './pricing.service.js';

/** What a payment request resolves to once the caller's right to make it is checked. */
interface PaymentTarget {
  purpose: TransactionPurpose;
  amount: string;
  description: string;
  agencyId?: string;
  packageType?: Transaction['packageType'];
  propertyId?: string;
  quantity?: number;
}

@Injectable()
export class HesabpayService {
  private readonly logger = new Logger(HesabpayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: HesabPayGateway,
    private readonly promotion: PromotionService,
    private readonly pricing: PricingService,
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
        quantity: target.quantity,
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

  /** What each purchase costs right now. Public: the prices are not secret and the UI shows them before paying. */
  async getPricing(): Promise<PricingDto> {
    return this.pricing.toWire(await this.pricing.effective());
  }

  /** The caller's own payments, newest first, with the receipt number of the ones that succeeded. */
  async listPayments(userId: string, page: PaginationQuery): Promise<Paginated<PaymentSummary>> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data: rows.map(toPaymentSummary),
      meta: { page: page.page, limit: page.limit, total, total_pages: Math.ceil(total / page.limit) },
    };
  }

  /**
   * The digital receipt of one of the caller's payments. Only a payment that succeeded has one (409
   * RECEIPT_NOT_AVAILABLE otherwise); someone else's payment looks exactly like a missing one.
   */
  async getReceipt(userId: string, id: string): Promise<Receipt> {
    const payment = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        ...paymentInclude,
        user: { select: { fullName: true, phoneNumber: true, agency: { select: { agencyName: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.status !== TransactionStatus.SUCCESS || !payment.receiptNumber || !payment.paidAt) {
      throw new ConflictException({
        message: 'Only a successful payment has a receipt.',
        code: 'RECEIPT_NOT_AVAILABLE',
      });
    }
    return {
      receipt_number: payment.receiptNumber,
      payment_id: payment.id,
      issued_at: payment.paidAt.toISOString(),
      purpose: payment.purpose,
      package_type: payment.packageType,
      quantity: payment.quantity,
      property: payment.property,
      amount: payment.amount.toNumber(),
      currency: payment.currency as Receipt['currency'],
      payer: {
        full_name: payment.user.fullName,
        phone_number: payment.user.phoneNumber,
        agency_name: payment.user.agency?.agencyName ?? null,
      },
      reference: payment.hesabpayTxId,
    };
  }

  /** The state of one of the caller's own payments (the app polls this after sending the user to pay). */
  async getPayment(userId: string, id: string): Promise<PaymentStatusDto> {
    // Someone else's payment looks exactly like a missing one.
    const payment = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!payment) throw new NotFoundException('Payment not found.');
    return {
      id: payment.id,
      purpose: payment.purpose,
      status: payment.status,
      amount: payment.amount.toNumber(),
      currency: this.settings.currency,
      created_at: payment.createdAt.toISOString(),
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
      // One statement flips the status AND issues the receipt (the database's CHECK constraint allows
      // a receipt only on a successful payment), and only the delivery that wins the PENDING -> SUCCESS race
      // gets a count of 1. The receipt number comes from a sequence, so a lost race never burns a duplicate.
      const now = new Date();
      const claimed = await db.$executeRaw`
        UPDATE transactions
           SET status = 'SUCCESS', paid_at = ${now}, updated_at = ${now}, receipt_number = next_receipt_number()
         WHERE id = ${payment.id}::uuid AND status = 'PENDING'`;
      if (claimed !== 1) return; // another delivery of the same webhook won the race
      await fulfil(db, payment, this.settings.featuredAdDays, now, this.promotion);
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
    // Read once: the price quoted below and the quantity recorded with it come from the same moment.
    const prices = await this.pricing.effective();
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
          amount: prices[`SUBSCRIPTION_${input.package_type}`].price,
          description: `Bongah agency subscription (${input.package_type})`,
          agencyId: user.agency.id,
          packageType: input.package_type,
        };
      }
      case 'MAP_LOCATION': {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (!user) throw new UnauthorizedException();
        // Active agencies and admins already pin for free; taking their money would buy nothing.
        if (await unlimitedMapLocationReason(this.prisma, userId, user.role, new Date())) {
          throw new ConflictException({
            message: 'Your account already includes unlimited map locations.',
            code: 'MAP_LOCATION_ALREADY_UNLIMITED',
          });
        }
        return {
          purpose: TransactionPurpose.MAP_LOCATION,
          amount: prices.MAP_LOCATION.price,
          description: 'Bongah map location add-on',
        };
      }
      case 'CONTACT_CREDITS': {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (!user) throw new UnauthorizedException();
        // Agencies with a subscription and admins already reveal for free; credits would buy nothing.
        if (await accountPerkReason(this.prisma, userId, user.role, new Date())) {
          throw new ConflictException({
            message: 'Your account already includes unlimited contact reveals.',
            code: 'CONTACT_ALREADY_UNLIMITED',
          });
        }
        return {
          purpose: TransactionPurpose.CONTACT_CREDITS,
          amount: prices.CONTACT_CREDITS.price,
          description: `Bongah contact reveal credits (${prices.CONTACT_CREDITS.quantity})`,
          quantity: prices.CONTACT_CREDITS.quantity ?? this.settings.contactCreditsPerPack,
        };
      }
      case 'LADDER':
      case 'FEATURED_AD': {
        await this.promotion.assertPromotable(this.prisma, userId, input.property_id);
        const ladder = input.purpose === 'LADDER';
        return {
          purpose: ladder ? TransactionPurpose.LADDER : TransactionPurpose.FEATURED_AD,
          amount: ladder ? prices.LADDER.price : prices.FEATURED_AD.price,
          description: ladder ? 'Bongah listing ladder' : 'Bongah featured listing',
          propertyId: input.property_id,
          // Featured days are recorded with the payment, like a credit pack's size.
          quantity: ladder ? undefined : (prices.FEATURED_AD.quantity ?? this.settings.featuredAdDays),
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
