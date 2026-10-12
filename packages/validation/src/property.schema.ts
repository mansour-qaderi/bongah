import { z } from 'zod';
import {
  AFGHANISTAN_BOUNDS,
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
} from '@bongah/shared-types';
import { cleanText, httpUrl, moneyAmount, placeName } from './common';

// Field names are snake_case: they are the public wire format of the property endpoints.

export const latitude = z
  .number()
  .min(AFGHANISTAN_BOUNDS.minLat, 'Latitude is outside Afghanistan')
  .max(AFGHANISTAN_BOUNDS.maxLat, 'Latitude is outside Afghanistan');
export const longitude = z
  .number()
  .min(AFGHANISTAN_BOUNDS.minLng, 'Longitude is outside Afghanistan')
  .max(AFGHANISTAN_BOUNDS.maxLng, 'Longitude is outside Afghanistan');

/**
 * No `.default()` anywhere in this shape: the update schema derives from it with `.partial()`,
 * and a default would silently overwrite stored values on every PATCH.
 */
const propertyShape = {
  title: cleanText(3, 150),
  description: cleanText(1, 5000),
  type: z.enum(PROPERTY_TYPES),
  deal_type: z.enum(DEAL_TYPES),
  price: moneyAmount,
  currency: z.enum(CURRENCIES),
  area_sqm: z.number().positive().max(100_000_000),
  bedrooms: z.int().min(0).max(50).nullish(),
  bathrooms: z.int().min(0).max(50).nullish(),
  province: placeName(60),
  district: placeName(80),
  address: cleanText(3, 300),
  lat: latitude,
  lng: longitude,
  images: z.array(httpUrl).max(20).optional(),
};

/**
 * POST /properties. Strict on purpose: fields the client may not set (status, is_featured,
 * laddered_at, user_id, agency_id) are rejected loudly instead of being silently dropped.
 */
export const createPropertySchema = z.strictObject(propertyShape);
export type CreatePropertyInput = z.output<typeof createPropertySchema>;

/** Statuses an owner can move a listing between. (Archiving is also DELETE /properties/:id.) */
export const PROPERTY_STATUS_INPUT = z.enum(PROPERTY_STATUSES);

/** PATCH /properties/:id: any subset of the editable fields. */
export const updatePropertySchema = z
  .strictObject(propertyShape)
  .partial()
  .extend({ status: PROPERTY_STATUS_INPUT.optional() })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to update')
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'lat and lng must be sent together',
    path: ['lat'],
  });
export type UpdatePropertyInput = z.output<typeof updatePropertySchema>;

// ───────────────────────── Query strings ─────────────────────────
// Query values are always strings. Parse them strictly (no Number('0x10'), no '' -> 0).

const queryInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/, 'Must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const queryMoney = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Must be a number with at most 2 decimals')
  .transform(Number);

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

const paginationShape = {
  page: queryInt(1, 100_000).default(1),
  limit: queryInt(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const paginationQuerySchema = z.strictObject(paginationShape);
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

/** GET /properties. Unknown parameters are rejected so a misspelled filter can't silently return everything. */
export const listPropertiesQuerySchema = z
  .strictObject({
    ...paginationShape,
    province: placeName(60).optional(),
    district: placeName(80).optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    deal_type: z.enum(DEAL_TYPES).optional(),
    min_price: queryMoney.optional(),
    max_price: queryMoney.optional(),
    /** Required with min_price/max_price: 500 AFGHANI and 500 USD are not comparable. */
    currency: z.enum(CURRENCIES).optional(),
  })
  .refine((q) => (q.min_price === undefined && q.max_price === undefined) || q.currency, {
    message: 'currency is required when filtering by price',
    path: ['currency'],
  })
  .refine(
    (q) => q.min_price === undefined || q.max_price === undefined || q.min_price <= q.max_price,
    { message: 'min_price must not be greater than max_price', path: ['min_price'] },
  );
export type ListPropertiesQuery = z.output<typeof listPropertiesQuerySchema>;
