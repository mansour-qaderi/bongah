// Enum values here MUST match the Prisma enums in apps/api/prisma/schema.prisma exactly:
// they are what the API sends and accepts on the wire.

export const LANGUAGES = ['fa', 'ps', 'en'] as const; // fa = Dari, ps = Pashto
export const ROLES = ['USER', 'AGENCY', 'ADMIN'] as const;
export const PROPERTY_TYPES = [
  'APARTMENT',
  'HOUSE_HAWILI',
  'LAND',
  'OFFICE_SHOP',
  'GARDEN_VILLA',
] as const;
export const DEAL_TYPES = ['SALE', 'RENT', 'MORTGAGE_GROWI'] as const;
export const CURRENCIES = ['AFGHANI', 'USD'] as const;
export const PROPERTY_STATUSES = ['ACTIVE', 'SOLD', 'ARCHIVED'] as const;
export const SUBSCRIPTION_PACKAGES = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED'] as const;
export const TRANSACTION_PURPOSES = ['SUBSCRIPTION', 'LADDER', 'FEATURED_AD'] as const;
export const TRANSACTION_STATUSES = ['PENDING', 'SUCCESS', 'FAILED'] as const;

export type Language = (typeof LANGUAGES)[number];
export type Role = (typeof ROLES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type DealType = (typeof DEAL_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type SubscriptionPackage = (typeof SUBSCRIPTION_PACKAGES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Afghanistan's bounding box. A sanity check on map pins, not a border: it includes slivers of neighbours. */
export const AFGHANISTAN_BOUNDS = {
  minLat: 29.3,
  maxLat: 38.6,
  minLng: 60.4,
  maxLng: 75.0,
} as const;
