import type { InitiatePaymentInput } from '@bongah/validation';

export { initiatePaymentSchema } from '@bongah/validation';

/** POST /hesabpay/payments body (already validated). Never carries an amount. */
export type InitiatePaymentDto = InitiatePaymentInput;
