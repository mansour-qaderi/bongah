import { z } from 'zod';
import { CURRENCIES } from '@bongah/shared-types';

export const createTransactionSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES),
  propertyId: z.uuid().optional(),
  agencyId: z.uuid().optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
