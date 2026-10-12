import { z } from 'zod';
import { afghanMobile, otpCode } from './common';

// Field names are snake_case: they are the public wire format of the auth endpoints.

export const sendOtpSchema = z.object({
  phone_number: afghanMobile,
});
export type SendOtpInput = z.output<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone_number: afghanMobile,
  otp_code: otpCode,
});
export type VerifyOtpInput = z.output<typeof verifyOtpSchema>;
