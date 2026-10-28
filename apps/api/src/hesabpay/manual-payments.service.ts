import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CHAT_IMAGE_TYPES, type ChatImageType } from '@bongah/shared-types';
import { recordAudit, type AuditAction } from '../audit/admin-audit.js';
import type { ChatImageStorage } from '../chat/images/chat-image.storage.js';
import { sniffImageType } from '../chat/images/image-signature.js';
import { tooLarge } from '../common/upload.js';
import { TransactionMethod, TransactionStatus, type Transaction } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PaymentStatusDto } from './dto/payment-response.dto.js';
import { HESABPAY_SETTINGS, type HesabPaySettings } from './hesabpay.config.js';
import { HesabpayService } from './hesabpay.service.js';

export const PAYMENT_PROOF_STORAGE = Symbol('PAYMENT_PROOF_STORAGE');

/**
 * Manual payments: the customer sends the money themselves (HesabPay app, card-to-card), uploads a picture of the
 * receipt, and an admin looks at it and confirms. The confirmation is the same delivery a webhook triggers (the plan,
 * the credits, the receipt number), so a manually confirmed payment is indistinguishable from a gateway one afterwards,
 * except for who decided and when.
 */
@Injectable()
export class ManualPaymentsService {
  private readonly logger = new Logger(ManualPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hesabpay: HesabpayService,
    @Inject(PAYMENT_PROOF_STORAGE) private readonly storage: ChatImageStorage,
    @Inject(HESABPAY_SETTINGS) private readonly settings: HesabPaySettings,
  ) {}

  get maxBytes(): number {
    return this.settings.proofMaxBytes;
  }

  /** The Content-Type header as one of the accepted picture types, or 415. */
  assertDeclaredType(header: string | undefined): ChatImageType {
    const declared = header?.split(';')[0].trim().toLowerCase();
    if (!declared || !(CHAT_IMAGE_TYPES as readonly string[]).includes(declared)) {
      throw new UnsupportedMediaTypeException({
        message: 'Only JPEG, PNG and WebP pictures can be uploaded.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }
    return declared as ChatImageType;
  }

  /**
   * Stores the receipt picture of one of the caller's own manual payments, replacing an earlier one. Only while the
   * payment still waits: once an admin has decided, the evidence they decided on is not changed under them.
   */
  async uploadProof(
    userId: string,
    id: string,
    declaredType: string | undefined,
    data: Buffer,
  ): Promise<PaymentStatusDto> {
    const declared = this.assertDeclaredType(declaredType);
    if (data.length === 0) throw new BadRequestException({ message: 'The picture is empty.', code: 'EMPTY_IMAGE' });
    if (data.length > this.maxBytes) throw tooLarge(this.maxBytes);
    if (sniffImageType(data) !== declared) {
      throw new UnsupportedMediaTypeException({
        message: 'The file is not the kind of picture it says it is.',
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    }

    // Someone else's payment looks exactly like a missing one.
    const payment = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!payment) throw new NotFoundException('Payment not found.');
    this.assertWaitingForReceipt(payment);

    const imageId = randomUUID();
    await this.storage.save(imageId, data);
    const stored = await this.prisma.transaction
      .updateMany({
        // The status is checked again here: an admin may have decided while the bytes were being stored.
        where: { id, userId, method: TransactionMethod.MANUAL, status: TransactionStatus.PENDING },
        data: {
          proofImageId: imageId,
          proofContentType: declared,
          proofByteSize: data.length,
          proofUploadedAt: new Date(),
        },
      })
      .catch(async (error: unknown) => {
        await this.storage.remove(imageId).catch(() => undefined);
        throw error;
      });
    if (stored.count !== 1) {
      await this.storage.remove(imageId).catch(() => undefined);
      throw notPending();
    }
    if (payment.proofImageId) await this.storage.remove(payment.proofImageId).catch(() => undefined);

    const fresh = await this.prisma.transaction.findUniqueOrThrow({ where: { id } });
    return this.hesabpay.toStatus(fresh);
  }

  /**
   * Records the transaction id the customer read off their receipt, replacing an earlier one. Works instead of the
   * picture or besides it; the admin compares it with the account's own history. One reference belongs to one live
   * payment, so a transfer cannot be claimed twice.
   */
  async submitReference(userId: string, id: string, reference: string): Promise<PaymentStatusDto> {
    const payment = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!payment) throw new NotFoundException('Payment not found.');
    this.assertWaitingForReceipt(payment);

    const stored = await this.prisma.transaction
      .updateMany({
        // The status is checked again here: an admin may have decided a moment ago.
        where: { id, userId, method: TransactionMethod.MANUAL, status: TransactionStatus.PENDING },
        data: { paymentReference: reference, referenceSubmittedAt: new Date() },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException({
            message: 'This transaction reference is already attached to another payment.',
            code: 'REFERENCE_ALREADY_USED',
          });
        }
        throw error;
      });
    if (stored.count !== 1) throw notPending();

    const fresh = await this.prisma.transaction.findUniqueOrThrow({ where: { id } });
    return this.hesabpay.toStatus(fresh);
  }

  /** The receipt picture of a payment, for the admin who reviews it. */
  async readProof(id: string): Promise<{ contentType: string; data: Buffer }> {
    const payment = await this.prisma.transaction.findUnique({
      where: { id },
      select: { proofImageId: true, proofContentType: true },
    });
    if (!payment?.proofImageId || !payment.proofContentType) throw new NotFoundException('No receipt picture.');
    const data = await this.storage.read(payment.proofImageId);
    if (!data) throw new NotFoundException('No receipt picture.');
    return { contentType: payment.proofContentType, data };
  }

  /**
   * Confirms a manual payment after looking at its receipt picture or checking its transaction id. With neither there is
   * nothing to confirm: use `forceActivate`.
   */
  async approve(adminId: string, id: string): Promise<void> {
    const payment = await this.pending(id);
    if (payment.method !== TransactionMethod.MANUAL) throw notManual();
    if (!payment.proofImageId && !payment.paymentReference) {
      throw new ConflictException({
        message:
          'This payment has neither a receipt picture nor a transaction reference. Ask the customer for one, or force-activate it with a reason.',
        code: 'RECEIPT_IMAGE_MISSING',
      });
    }
    await this.settle(adminId, payment, 'PAYMENT_APPROVED', false, null);
  }

  /**
   * Activates a payment WITHOUT a receipt picture, on the admin's word (the customer phoned, the money is in the
   * account...). The reason is required and kept in the audit log and on the payment. Works on any waiting payment,
   * so a payment stuck at a gateway that never answered can be rescued too; if the gateway's confirmation arrives
   * later it finds the payment already settled and does nothing.
   */
  async forceActivate(adminId: string, id: string, reason: string): Promise<void> {
    await this.settle(adminId, await this.pending(id), 'PAYMENT_FORCE_ACTIVATED', true, reason);
  }

  /** Refuses a manual payment (wrong amount, unreadable picture, the money never arrived). The customer sees the reason and can pay again. */
  async reject(adminId: string, id: string, reason: string): Promise<void> {
    const payment = await this.pending(id);
    if (payment.method !== TransactionMethod.MANUAL) throw notManual();
    await this.prisma.$transaction(async (db) => {
      const now = new Date();
      const refused = await db.transaction.updateMany({
        where: { id, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.FAILED, reviewedById: adminId, reviewedAt: now, reviewNote: reason },
      });
      if (refused.count !== 1) throw notPending(); // someone decided first
      await recordAudit(db, {
        actorId: adminId,
        action: 'PAYMENT_REJECTED',
        targetType: 'payment',
        targetId: id,
        metadata: {
          reason,
          amount: payment.amount.toString(),
          purpose: payment.purpose,
          had_receipt: payment.proofImageId !== null,
          ...(payment.paymentReference ? { reference: payment.paymentReference } : {}),
        },
      });
    });
    this.logger.log(`Payment ${id} refused by admin ${adminId}`);
  }

  private async settle(
    adminId: string,
    payment: Transaction,
    action: Extract<AuditAction, 'PAYMENT_APPROVED' | 'PAYMENT_FORCE_ACTIVATED'>,
    force: boolean,
    reason: string | null,
  ): Promise<void> {
    const delivered = await this.hesabpay.settleSuccess(payment, async (db, now) => {
      // Inside the delivery's own transaction: the decision, its audit line and what the payment bought commit together.
      await db.transaction.update({
        where: { id: payment.id },
        data: { reviewedById: adminId, reviewedAt: now, reviewNote: reason, forceActivated: force },
      });
      await recordAudit(db, {
        actorId: adminId,
        action,
        targetType: 'payment',
        targetId: payment.id,
        metadata: {
          ...(reason ? { reason } : {}),
          amount: payment.amount.toString(),
          purpose: payment.purpose,
          method: payment.method,
          had_receipt: payment.proofImageId !== null,
          ...(payment.paymentReference ? { reference: payment.paymentReference } : {}),
        },
      });
    });
    if (!delivered) throw notPending(); // a webhook or another admin got there first
  }

  private async pending(id: string): Promise<Transaction> {
    const payment = await this.prisma.transaction.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.status !== TransactionStatus.PENDING) throw notPending();
    return payment;
  }

  private assertWaitingForReceipt(payment: Transaction): void {
    if (payment.method !== TransactionMethod.MANUAL) throw notManual();
    if (payment.status !== TransactionStatus.PENDING) throw notPending();
  }
}

/** Prisma's unique-constraint error (P2002), without importing its error class just to test for it. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function notPending(): ConflictException {
  return new ConflictException({ message: 'This payment is no longer waiting.', code: 'PAYMENT_NOT_PENDING' });
}

function notManual(): ConflictException {
  return new ConflictException({ message: 'This is not a manual payment.', code: 'NOT_A_MANUAL_PAYMENT' });
}
