import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { WEBHOOK_SIGNATURE_HEADER } from '../hesabpay.constants.js';
import type { HesabPaySettings } from '../hesabpay.config.js';
import {
  HesabPayGateway,
  type PaymentSession,
  type PaymentSessionRequest,
  type VerifiedWebhookEvent,
  type WebhookInput,
} from './hesabpay-gateway.js';
import { parseWebhookPayload } from './webhook-payload.js';

/** Development/test gateway: no network. Webhooks are HMAC-SHA256 signed with HESABPAY_WEBHOOK_SECRET. */
@Injectable()
export class MockHesabPayGateway extends HesabPayGateway {
  constructor(private readonly settings: HesabPaySettings) {
    super();
  }

  // `async` so that every failure is a rejected promise, never a synchronous throw.
  async createSession(_request: PaymentSessionRequest): Promise<PaymentSession> {
    const id = `mock_${randomUUID()}`;
    return { id, paymentUrl: `https://pay.mock.invalid/${id}` };
  }

  async verifyWebhook({ rawBody, headers }: WebhookInput): Promise<VerifiedWebhookEvent> {
    const header = headers[WEBHOOK_SIGNATURE_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided || !/^[0-9a-f]{64}$/i.test(provided)) {
      throw new UnauthorizedException('Missing or malformed webhook signature.');
    }
    const expected = createHmac('sha256', this.settings.webhookSecret).update(rawBody).digest();
    const given = Buffer.from(provided, 'hex');
    // Equal length is guaranteed by the pattern above; timingSafeEqual throws otherwise.
    if (!timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    return parseWebhookPayload(rawBody);
  }
}
