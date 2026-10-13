import type {
  Currency,
  DealType,
  MapLocationUnlimitedReason,
  PropertyStatus,
  PropertyType,
  RewardReason,
  RewardType,
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

// ───────────── Agency dashboard ─────────────

/** One of the agency's active listings on the dashboard, ranked by views. */
export interface DashboardListing {
  id: string;
  title: string;
  price: number;
  currency: Currency;
  view_count: number;
  /** True only while a paid featured promotion is running. */
  is_featured: boolean;
  featured_until: string | null;
  laddered_at: string | null;
}

/** GET /agencies/me/dashboard: what the agency CRM home screen shows. */
export interface AgencyDashboard {
  agency: {
    id: string;
    agency_name: string;
    is_verified: boolean;
  };
  stats: {
    /** Listings the agency still has: active and sold. Archived ("deleted") ones are not counted. */
    total_properties: number;
    active_listings: number;
    /** Active listings whose paid featured promotion is running right now. */
    featured_listings: number;
    /** Views of every listing the agency ever published, archived ones included (views earned do not vanish). */
    total_views: number;
  };
  subscription: {
    /** A subscription is running right now. Same rule that lets the agency publish. */
    is_active: boolean;
    /** The plan running now; null when not active. */
    package_type: SubscriptionPackage | null;
    /** When publishing rights end, counting plans bought in advance; null when not active. */
    ends_at: string | null;
    /** Whole days left, rounded up (3 hours left is 1 day). 0 when not active. */
    remaining_days: number;
  };
  /** Up to 5 active listings, most viewed first. */
  top_listings: DashboardListing[];
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
  /** True when this login created the account AND a valid referral code was used (both got their reward). */
  referral_applied: boolean;
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

// ───────────── Referrals & rewards ─────────────

/** A friend who signed up with the user's code. Phone numbers are masked: the app shows who, not how to reach them. */
export interface ReferralInvitee {
  name: string | null;
  /** e.g. "+9370••••123". */
  phone_masked: string;
  joined_at: string;
  /** False when the user had already reached the reward limit: the friend still got theirs. */
  reward_granted: boolean;
}

export interface RewardItem {
  type: RewardType;
  reason: RewardReason;
  amount: number;
  created_at: string;
  /** When a ladder token was spent; null while it is still available. */
  used_at: string | null;
}

export interface ReferralSummary {
  referral_code: string;
  /** The invite link to share, or null when the server has no link configured (share the code alone). */
  share_url: string | null;
  stats: {
    /** Everyone who signed up with the code. */
    invited_count: number;
    /** How many of them earned the user a reward. */
    rewarded_invites: number;
    /** Invites beyond this earn the inviter nothing (the friend still gets their reward). */
    max_rewarded_invites: number;
    ladder_tokens_available: number;
    ladder_tokens_earned: number;
  };
  /** Newest first, at most 50. */
  invited: ReferralInvitee[];
  /** Newest first, at most 50. */
  rewards: RewardItem[];
}

export interface RedeemLadderTokenResponse {
  property_id: string;
  laddered_at: string;
  ladder_tokens_available: number;
}
