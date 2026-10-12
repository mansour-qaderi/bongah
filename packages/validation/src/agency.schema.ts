import { z } from 'zod';
import { afghanMobile } from './common';

export const createAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: afghanMobile,
  province: z.string().trim().min(2),
  address: z.string().trim().max(300).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
});
export type CreateAgencyInput = z.infer<typeof createAgencySchema>;
