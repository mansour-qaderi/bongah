import { z } from 'zod';
import { afghanMobile, otpCode } from './common';
import { optionalReferralCode } from './referral.schema';

// Field names are snake_case: they are the public wire format of the auth endpoints.

export const sendOtpSchema = z.object({
  phone_number: afghanMobile,
});
export type SendOtpInput = z.output<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone_number: afghanMobile,
  otp_code: otpCode,
  /** Only used when this login creates the account; an existing user's is ignored. */
  referral_code: optionalReferralCode,
});
export type VerifyOtpInput = z.output<typeof verifyOtpSchema>;
