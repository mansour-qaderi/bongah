import { z } from 'zod';
import {
  AFGHANISTAN_BOUNDS,
  CURRENCIES,
  DEAL_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
} from '@bongah/shared-types';
import { cleanText, httpUrl, moneyAmount, normalizePlaceName, placeName } from './common';

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
/**
 * A place name that may be left blank: '' means "not given". Used for the structured parts of an address (district,
 * neighbourhood), which a pin fills in and a written address may leave out. Anything typed must still look like a
 * name (2+ characters).
 */
const optionalPlace = (max: number) =>
  z
    .string()
    .transform(normalizePlaceName)
    .pipe(
      z
        .string()
        .max(max, `At most ${max} characters`)
        .refine((value) => value === '' || value.length >= 2, 'Too short'),
    )
    .optional();

const propertyShape = {
  title: cleanText(3, 150),
  /** Optional: a listing can be published without a description. Stored as '' when left out. */
  description: cleanText(0, 5000).optional(),
  type: z.enum(PROPERTY_TYPES),
  deal_type: z.enum(DEAL_TYPES),
  price: moneyAmount,
  currency: z.enum(CURRENCIES),
  area_sqm: z.number().positive().max(100_000_000),
  bedrooms: z.int().min(0).max(50).nullish(),
  bathrooms: z.int().min(0).max(50).nullish(),
  province: placeName(60),
  /** Optional: filled in from the pin when there is one. */
  district: optionalPlace(80),
  neighborhood: optionalPlace(80),
  address: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .max(300, 'At most 300 characters')
        .refine((value) => value === '' || value.length >= 3, 'At least 3 characters'),
    )
    .optional(),
  /** Optional pin. Free for everyone. With one, the address may be left blank; without one it is required. */
  lat: latitude.optional(),
  lng: longitude.optional(),
  images: z.array(httpUrl).max(20).optional(),
};

/**
 * POST /properties. Strict on purpose: fields the client may not set (status, is_featured,
 * laddered_at, user_id, agency_id) are rejected loudly instead of being silently dropped.
 */
export const createPropertySchema = z
  .strictObject(propertyShape)
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'lat and lng must be sent together',
    path: ['lat'],
  })
  // Where the listing is: a pin on the map, OR the address written out as one line. A pin makes even the address
  // optional; district and neighbourhood are never required (a pin fills them in, a written address carries them).
  .superRefine((value, ctx) => {
    if (value.lat !== undefined) return;
    if (!value.address) {
      ctx.addIssue({
        code: 'custom',
        message: 'Required unless a map location is chosen',
        path: ['address'],
      });
    }
  });
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

export const queryInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/, 'Must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const queryMoney = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Must be a number with at most 2 decimals')
  .transform(Number);

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export const paginationShape = {
  page: queryInt(1, 100_000).default(1),
  limit: queryInt(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const paginationQuerySchema = z.strictObject(paginationShape);
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

/** A decimal degree as the app writes it in a URL: "34.5281", "-70.1". At most 8 decimals (about a millimetre). */
const queryDegrees = (limit: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,8})?$/, 'Must be a decimal degree')
    .transform(Number)
    .pipe(z.number().min(-limit).max(limit));

const AREA_KEYS = ['min_lat', 'max_lat', 'min_lng', 'max_lng'] as const;

/** GET /properties. Unknown parameters are rejected so a misspelled filter can't silently return everything. */
export const listPropertiesQuerySchema = z
  .strictObject({
    ...paginationShape,
    province: placeName(60).optional(),
    district: placeName(80).optional(),
    /** true: only listings with an exact pin (what the map shows). false: only those without. */
    has_location: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    deal_type: z.enum(DEAL_TYPES).optional(),
    min_price: queryMoney.optional(),
    max_price: queryMoney.optional(),
    /** Required with min_price/max_price: 500 AFGHANI and 500 USD are not comparable. */
    currency: z.enum(CURRENCIES).optional(),
    /**
     * The part of the map on screen: only listings whose exact pin is inside this box. All four or none.
     * (Listings without a pin are never inside a box, so an area implies has_location=true.)
     */
    min_lat: queryDegrees(90).optional(),
    max_lat: queryDegrees(90).optional(),
    min_lng: queryDegrees(180).optional(),
    max_lng: queryDegrees(180).optional(),
  })
  .refine((q) => AREA_KEYS.every((key) => q[key] !== undefined) || AREA_KEYS.every((key) => q[key] === undefined), {
    message: 'min_lat, max_lat, min_lng and max_lng must be given together',
    path: ['min_lat'],
  })
  // (A partly given area is already reported above; this only compares a complete one.)
  .refine((q) => !AREA_KEYS.every((key) => q[key] !== undefined) || (q.min_lat! <= q.max_lat! && q.min_lng! <= q.max_lng!), {
    message: 'min_lat/min_lng must not be greater than max_lat/max_lng',
    path: ['min_lat'],
  })
  .refine((q) => q.min_lat === undefined || q.has_location !== false, {
    message: 'An area only contains listings that have a pin, so it cannot be combined with has_location=false',
    path: ['has_location'],
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
