export const LANGUAGES = ['fa', 'ps', 'en'] as const; // fa = Dari, ps = Pashto
export const USER_ROLES = ['customer', 'agent', 'agency_admin', 'admin'] as const;
export const LISTING_TYPES = ['sale', 'rent', 'mortgage'] as const;
export const PROPERTY_TYPES = ['house', 'apartment', 'land', 'shop', 'office'] as const;
export const PROPERTY_STATUSES = ['draft', 'active', 'sold', 'rented', 'archived'] as const;
export const CURRENCIES = ['AFN', 'USD'] as const;
export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;

export type Language = (typeof LANGUAGES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type ListingType = (typeof LISTING_TYPES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
