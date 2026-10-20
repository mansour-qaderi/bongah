import type { InitiatePaymentInput, UseFeaturedCreditInput } from '@bongah/validation';

export { initiatePaymentSchema, useFeaturedCreditSchema } from '@bongah/validation';

/** POST /hesabpay/payments body (already validated). Never carries an amount. */
export type InitiatePaymentDto = InitiatePaymentInput;

/** POST /hesabpay/featured-credits/use body (already validated). */
export type UseFeaturedCreditDto = UseFeaturedCreditInput;
