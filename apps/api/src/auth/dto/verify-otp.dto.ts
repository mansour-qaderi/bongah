import type { VerifyOtpInput } from '@bongah/validation';

export { verifyOtpSchema } from '@bongah/validation';

/** POST /auth/verify-otp body (already validated; phone_number is canonical +93…). */
export type VerifyOtpDto = VerifyOtpInput;
