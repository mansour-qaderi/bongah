import { z } from 'zod';
import { CURRENCIES, LISTING_TYPES, PROPERTY_TYPES } from '@bongah/shared-types';

export const createPropertySchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(5000),
  listingType: z.enum(LISTING_TYPES),
  propertyType: z.enum(PROPERTY_TYPES),
  price: z.number().positive(),
  currency: z.enum(CURRENCIES),
  areaSqm: z.number().positive(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  province: z.string().trim().min(2),
  district: z.string().trim().optional(),
  address: z.string().trim().max(300).optional(),
  imageUrls: z.array(z.url()).max(20).default([]),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
