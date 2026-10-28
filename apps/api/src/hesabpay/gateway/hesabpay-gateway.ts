import type { IncomingHttpHeaders } from 'node:http';
import type { Currency } from '../../generated/prisma/client.js';

export interface PaymentSessionRequest {
  /** Our transaction id, so the provider's records can be matched to ours. */
  reference: string;
  /** Decimal string with at most 2 decimals. */
  amount: string;
  currency: Currency;
  description: string;
}

export interface PaymentSession {
  /** The provider's identifier for this payment; stored as transactions.hesabpay_tx_id. */
  id: string;
  /** Where the user completes the payment; null when there is no page to send them to (manual payments). */
  paymentUrl: string | null;
}

/** A webhook that has passed signature verification, in provider-independent form. */
export interface VerifiedWebhookEvent {
  /** Matches PaymentSession.id. */
  sessionId: string;
  status: 'SUCCESS' | 'FAILED';
  /** What the provider says it charged, when the webhook says. Compared against what we asked for. */
  amount?: string;
  currency?: string;
}

export interface WebhookInput {
  rawBody: Buffer;
  headers: IncomingHttpHeaders;
}

/**
 * The only place that knows how HesabPay is spoken to. Swap or fix an implementation here without
 * touching payment rules. Implementations must fail closed: anything unexpected is an error,
 * never a "valid" webhook.
 */
export abstract class HesabPayGateway {
  /** Creates a payment the user can complete. Throws BadGatewayException if the provider is unavailable. */
  abstract createSession(request: PaymentSessionRequest): Promise<PaymentSession>;

  /**
   * Proves a webhook really came from HesabPay and returns its content.
   * Throws UnauthorizedException when the signature is missing or wrong, BadRequestException when
   * the signed payload is malformed.
   */
  abstract verifyWebhook(input: WebhookInput): Promise<VerifiedWebhookEvent>;
}
