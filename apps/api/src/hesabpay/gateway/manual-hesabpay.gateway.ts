import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  HesabPayGateway,
  type PaymentSession,
  type PaymentSessionRequest,
  type VerifiedWebhookEvent,
} from './hesabpay-gateway.js';

/**
 * The gateway of manual mode: there is no provider. A "session" is only an id for the row (the column is unique and
 * required), with no page to send anyone to: the customer is shown where to send the money, and an admin settles
 * the payment by hand. Because nobody can sign for a provider that does not exist, every webhook is refused: the
 * endpoint stays closed instead of becoming a way to mark payments as paid.
 */
@Injectable()
export class ManualHesabPayGateway extends HesabPayGateway {
  async createSession(_request: PaymentSessionRequest): Promise<PaymentSession> {
    return { id: `manual_${randomUUID()}`, paymentUrl: null };
  }

  async verifyWebhook(): Promise<VerifiedWebhookEvent> {
    throw new UnauthorizedException('Webhooks are not accepted: payments are confirmed by hand.');
  }
}
