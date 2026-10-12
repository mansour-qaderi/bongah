import type { Transaction } from '@bongah/shared-types';

/** Returned when a payment is started: send the user to `payment_url` to pay. */
export interface PaymentInitiatedDto extends Transaction {
  payment_url: string;
}

/** What the webhook endpoint answers once an event has been accepted. */
export interface WebhookAckDto {
  received: true;
}
