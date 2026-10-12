import type { SendOtpInput } from '@bongah/validation';

export { sendOtpSchema } from '@bongah/validation';

/** POST /auth/send-otp body (already validated; phone_number is canonical +93…). */
export type SendOtpDto = SendOtpInput;
