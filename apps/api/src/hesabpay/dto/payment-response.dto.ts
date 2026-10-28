import type { FeaturedCreditUsed, PaymentInitiated, PaymentStatus, Pricing } from '@bongah/shared-types';

export type PaymentInitiatedDto = PaymentInitiated;
export type PaymentStatusDto = PaymentStatus;
export type PricingDto = Pricing;
export type FeaturedCreditUsedDto = FeaturedCreditUsed;

/** What the webhook endpoint answers once an event has been accepted. */
export interface WebhookAckDto {
  received: true;
}
