import type {
  Currency,
  DealType,
  PropertyStatus,
  PropertyType,
  Role,
  SubscriptionPackage,
  SubscriptionStatus,
  TransactionPurpose,
  TransactionStatus,
} from './constants';

// These are API wire types, not database entities: field names are snake_case exactly as
// the REST API sends them, and dates are ISO-8601 strings.

export interface User {
  id: string;
  phone_number: string;
  full_name: string | null;
  role: Role;
  avatar: string | null;
}

export interface Agency {
  id: string;
  user_id: string;
  agency_name: string;
  license_photo: string;
  address: string;
  lat: number;
  lng: number;
  description: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  user_id: string;
  agency_id: string | null;
  title: string;
  description: string;
  type: PropertyType;
  deal_type: DealType;
  /** Up to 2 decimals. Safe as a JSON number (the column holds at most 14 digits). */
  price: number;
  currency: Currency;
  area_sqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  province: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  images: string[];
  status: PropertyStatus;
  /** True only while a paid featured promotion is running. */
  is_featured: boolean;
  featured_until: string | null;
  laddered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: Pagination;
}

export interface Subscription {
  id: string;
  agency_id: string;
  package_type: SubscriptionPackage;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
}

export interface Transaction {
  id: string;
  purpose: TransactionPurpose;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  created_at: string;
}
