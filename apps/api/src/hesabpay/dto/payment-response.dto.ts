import type { PaymentInitiated, Pricing, Transaction } from '@bongah/shared-types';

export type PaymentInitiatedDto = PaymentInitiated;
export type PaymentStatusDto = Transaction;
export type PricingDto = Pricing;

/** What the webhook endpoint answers once an event has been accepted. */
export interface WebhookAckDto {
  received: true;
}
