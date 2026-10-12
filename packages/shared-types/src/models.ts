import type {
  Currency,
  DealType,
  MapLocationUnlimitedReason,
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
  /** Exact office pin; null until a subscribed agency places it. */
  lat: number | null;
  lng: number | null;
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
  /** Free-text neighbourhood. Null only on listings created before the field existed. */
  neighborhood: string | null;
  address: string;
  /** Exact map pin. Null (together with lng) when the listing has none: pins are a paid feature. */
  lat: number | null;
  lng: number | null;
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

// ───────────── Auth ─────────────

export interface SendOtpResponse {
  message: string;
  /** Seconds until the code expires. */
  expires_in: number;
  /** Seconds before another code can be requested. */
  resend_after: number;
  /** The code itself. Only present with the mock SMS gateway outside production. */
  dev_otp?: string;
}

export interface VerifyOtpResponse {
  access_token: string;
  token_type: 'Bearer';
  /** Seconds until the access token expires. */
  expires_in: number;
  /** True when this login created the account (the app can then ask for a name). */
  is_new_user: boolean;
  user: User;
}

// ───────────── Listings & payments ─────────────

/** Who to call about a listing. Only sent to signed-in users. */
export interface PropertyContact {
  full_name: string | null;
  phone_number: string;
  /** Set when the listing belongs to a real-estate agency. */
  agency_name: string | null;
}

/** What each purchase costs. Prices are decided by the server. */
export interface Pricing {
  currency: Currency;
  subscription: Record<SubscriptionPackage, number>;
  ladder: number;
  featured_ad: number;
  /** One exact map pin on one listing, for accounts without an agency subscription. */
  map_location: number;
  /** How long a paid featured badge lasts. */
  featured_ad_days: number;
}

/** Whether the signed-in user may put exact coordinates on a listing, and what they have prepaid. */
export interface MapLocationStatus {
  /** True for active-subscription agencies and admins: no token is ever needed. */
  unlimited: boolean;
  unlimited_reason: MapLocationUnlimitedReason | null;
  /** Prepaid pins not yet spent (always counted, even for unlimited accounts). */
  tokens_available: number;
}

/** Returned when a payment is started: send the user to `payment_url` to pay. */
export interface PaymentInitiated extends Transaction {
  payment_url: string;
}

/** The JSON body of an API error. `errors` is present for validation failures, `code` for business rules. */
export interface ApiErrorBody {
  message?: string;
  code?: string;
  errors?: { field: string; message: string }[];
  /** Seconds to wait (rate limits). */
  retry_after?: number;
  resets_at?: string;
}
