import { z } from 'zod';
import { LANGUAGES } from '@bongah/shared-types';
import { afghanMobile } from './common';

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: afghanMobile,
  email: z.email().optional(),
  password: z.string().min(8).max(128),
  role: z.enum(['customer', 'agent']).default('customer'), // admin roles are never self-assigned
  preferredLanguage: z.enum(LANGUAGES).default('fa'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const loginSchema = z.object({
  phone: afghanMobile,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
