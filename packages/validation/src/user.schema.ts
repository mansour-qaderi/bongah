import { z } from 'zod';
import { cleanText, httpUrl } from './common';

/**
 * Completing the profile of a signed-in user. The account itself is created by the first
 * successful OTP login (see auth.schema.ts); the phone number comes from the verified token and is
 * never accepted from the body, and neither is `role`.
 */
export const registerUserSchema = z.strictObject({
  full_name: cleanText(2, 100),
  avatar: httpUrl.nullish(),
});
export type RegisterUserInput = z.output<typeof registerUserSchema>;
