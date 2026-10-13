import { z } from 'zod';

/**
 * POST /properties/:id/contact/unlock.
 *
 * `use_credit` is the user's consent to spend a credit once the free reveals for the day are used.
 * Without it the server never spends one: a plain "show me the number" tap can cost nothing but
 * a free reveal.
 */
export const unlockContactSchema = z.strictObject({
  use_credit: z.boolean().optional(),
});
export type UnlockContactInput = z.output<typeof unlockContactSchema>;
