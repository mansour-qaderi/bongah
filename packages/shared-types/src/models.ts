import type {
  AbuseReason,
  AbuseReportStatus,
  AbuseTargetType,
  AgencyVerificationStatus,
  BannerPlacement,
  Currency,
  DealType,
  GeoProvider,
  ContactUnlockMethod,
  MapLocationUnlimitedReason,
  MessageType,
  Language,
  LadderSpendPurpose,
  PerkReason,
  PlanBenefits,
  PricingKey,
  PriceTerms,
  PropertyStatus,
  PropertyType,
  QuoteCategory,
  RewardReason,
  RewardType,
  Role,
  SubscriptionPackage,
  SubscriptionStatus,
  TransactionMethod,
  TransactionPurpose,
  TransactionStatus,
} from "./constants";

// These are API wire types, not database entities: field names are snake_case exactly as
// the REST API sends them, and dates are ISO-8601 strings.

export interface User {
  id: string;
  phone_number: string;
  full_name: string | null;
  role: Role;
  avatar: string | null;
  /** The morning quote push is wanted. (The phone's notification permission is separate.) */
  enable_daily_motivation: boolean;
  /** The welcome card has been shown to this user. Goes false -> true once and never back. */
  has_seen_welcome: boolean;
  /**
   * Gift listings left: a new account starts with one, and the first listing it posts uses it up (before the
   * monthly free listing, which stays available). Absent from servers that predate the gift.
   */
  welcome_listing_credits?: number;
  /**
   * Extra listings left from the first-subscription bonus. A subscribed agency uses them after its month's allowance
   * is spent. Absent from servers that predate the bonus.
   */
  bonus_listing_credits?: number;
  /** Featured-listing credits left (bought in a bundle or given as a bonus). Absent from servers that predate them. */
  featured_credits?: number;
  /**
   * True until the first-subscription bonus (extra listings and a free featured listing) has been given, so the
   * app only promises it to someone who can still get it. Absent from servers that predate the bonus.
   */
  first_subscription_bonus_available?: boolean;
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
  /** True exactly when `verification_status` is VERIFIED. */
  is_verified: boolean;
  verification_status: AgencyVerificationStatus;
  /** Why the documents were refused (REJECTED only), so the agency can fix them and resubmit. */
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** One verified agency office on the map. Only agencies that placed a pin appear; the owner's number is not public. */
export interface AgencyMapPin {
  id: string;
  agency_name: string;
  address: string;
  lat: number;
  lng: number;
  /** Listings it has published that are active right now. */
  active_listings: number;
}

/**
 * The outline of a plot, as GeoJSON (RFC 7946): a Polygon whose rings hold [longitude, latitude] pairs,
 * outer ring first, each ring closed. The same shape agvmap stores for a plot.
 */
export interface PlotBoundary {
  type: "Polygon";
  coordinates: number[][][];
}

export interface Property {
  id: string;
  user_id: string;
  agency_id: string | null;
  /** Public name of the agency that published it; null for a private owner. (The owner's number stays behind the contact reveal.) */
  agency_name: string | null;
  /**
   * A private owner's own name, shown under the price in place of "owner". Null for an agency's listing (the agency's
   * name is its face), for an owner who has not given a name, and from a server that does not send it.
   */
  owner_name?: string | null;
  title: string;
  description: string;
  type: PropertyType;
  /** Which unit of a building it is ("واحد ۳"), as the owner wrote it. Null when the owner did not say. */
  unit?: string | null;
  deal_type: DealType;
  /** How long a mortgage (گروی) runs, in months. Only a MORTGAGE_GROWI listing has one; null when not given. */
  mortgage_months?: number | null;
  /** Whether the price is final (مقطوع) or open to an offer (جورآمد). Null when the owner did not say. */
  price_terms?: PriceTerms | null;
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
  /**
   * The plot's outline the owner drew, when the listing has one: a GeoJSON Polygon, [longitude, latitude], one closed
   * ring. Optional because an older API does not send it; null when the listing has none.
   */
  boundary?: PlotBoundary | null;
  images: string[];
  /**
   * The plan the publishing agency is on right now, or null (a private owner, or a lapsed plan). Public on
   * purpose: the apps put listings of subscribed agencies first where several share one spot. Optional because
   * an older API does not send it.
   */
  agency_plan?: SubscriptionPackage | null;
  status: PropertyStatus;
  /** True only while a paid featured promotion is running. */
  is_featured: boolean;
  featured_until: string | null;
  laddered_at: string | null;
  /**
   * How many times the listing was opened. Sent only on the owner's own lists (GET /properties/mine) and absent from
   * public answers.
   */
  view_count?: number;
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
    verification_status: AgencyVerificationStatus;
    rejection_reason: string | null;
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
  token_type: "Bearer";
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
  /** What each plan costs. */
  subscription: Record<SubscriptionPackage, number>;
  /**
   * What each plan would cost without the discount (the monthly list price times its months), so the app can write
   * the saving as a number that is true. Absent from servers that predate the plan discounts.
   */
  subscription_list?: Record<SubscriptionPackage, number>;
  ladder: number;
  featured_ad: number;
  /** One exact map pin on one listing, for accounts without an agency subscription. */
  map_location: number;
  /** How long a paid featured badge lasts. */
  featured_ad_days: number;
  /** One pack of contact reveal credits. */
  contact_credits: number;
  /** How many credits one pack contains. */
  contact_credits_per_pack: number;
  /** Featured-listing bundles that can be bought ahead of time. Absent from servers that predate them. */
  featured_bundles?: FeaturedBundle[];
  /** What each plan includes (listings, launch gifts, features). Absent from servers that predate it. */
  plans?: Record<SubscriptionPackage, PlanBenefits>;
}

/** POST /hesabpay/featured-credits/use: the listing is featured, and this is what is left. */
export interface FeaturedCreditUsed {
  /** When the featured badge now ends. */
  featured_until: string;
  /** Featured-listing credits left after this one. */
  featured_credits: number;
}

/** One bundle of featured listings, bought now and spent on listings later. */
export interface FeaturedBundle {
  /** How many featured listings it contains. */
  size: number;
  price: number;
  /** What the same number would cost one by one. */
  list_price: number;
  /** The discount the price really gives, in whole percent. */
  discount_percent: number;
}

/** Whether the signed-in user may put exact coordinates on a listing, and what they have prepaid. */
export interface MapLocationStatus {
  /** True for active-subscription agencies and admins: no token is ever needed. */
  unlimited: boolean;
  unlimited_reason: MapLocationUnlimitedReason | null;
  /** Prepaid pins not yet spent (always counted, even for unlimited accounts). */
  tokens_available: number;
}

/** Where the customer sends the money in manual mode: a HesabPay wallet (by phone number) or a bank card. */
export interface ManualPaymentAccount {
  kind: 'HESABPAY' | 'CARD';
  /** The phone number of the HesabPay account, or the card number. Shown as is, to be copied. */
  number: string;
  /** The name the account is in: the customer checks it before sending. */
  holder: string;
  /** The bank of a card. */
  bank: string | null;
}

/** Everything the customer needs to pay by hand. Set by the operator in the API's environment. */
export interface ManualPaymentInfo {
  accounts: ManualPaymentAccount[];
  /** An extra line the operator wants shown with the accounts (opening hours of the review, a support number). */
  note: string | null;
}

/**
 * Returned when a payment is started. With the payment gateway, send the user to `payment_url` to pay. In manual mode
 * `payment_url` is null: show `manual` (where to send the money), then ask for the receipt.
 */
export interface PaymentInitiated extends Transaction {
  payment_url: string | null;
  /** Absent from servers that predate manual payments (treat as GATEWAY). */
  method?: TransactionMethod;
  manual?: ManualPaymentInfo | null;
  receipt_uploaded?: boolean;
  /** The transaction id the customer typed in (manual payments). */
  reference?: string | null;
}

/** GET /hesabpay/payments/:id: the state of one payment (the app polls it after sending the user to pay). */
export interface PaymentStatus extends Transaction {
  method?: TransactionMethod;
  /** MANUAL, still PENDING: where to send the money (so a customer who comes back can still pay). */
  manual?: ManualPaymentInfo | null;
  /** The customer has sent a picture of the transfer receipt. */
  receipt_uploaded?: boolean;
  /** The transaction id the customer typed in, from their HesabPay / bank receipt. */
  reference?: string | null;
  /** Why a manual payment was refused; set exactly when it was. */
  review_note?: string | null;
}

/** The JSON body of an API error. `errors` is present for validation failures, `code` for business rules. */
export interface ApiErrorBody {
  message?: string;
  code?: string;
  errors?: { field: string; message: string }[];
  /** Seconds to wait (rate limits). */
  retry_after?: number;
  resets_at?: string;
  /** The allowance that was used up (the 403 limit errors). */
  limit?: number;
  /** Ladders the refused spend needed (the 409 NOT_ENOUGH_LADDERS error). */
  needed?: number;
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
    /** Contact reveal credits each side earns per invite; 0 when invites earn only ladder tokens. */
    contact_credits_per_invite: number;
    ladder_tokens_available: number;
    ladder_tokens_earned: number;
  };
  /** Newest first, at most 50. */
  invited: ReferralInvitee[];
  /** Newest first, at most 50. */
  rewards: RewardItem[];
}

/** POST /rewards/ladders/spend: what the ladders bought, and what is left. */
export interface SpendLaddersResponse {
  purpose: LadderSpendPurpose;
  /** Unspent ladders after this spend. */
  ladders_available: number;
  /** FEATURED_FRAME: when the listing's frame ends. Null for a listing quota. */
  featured_until: string | null;
  /** LISTING_QUOTA: the listings still available on top of the free ones, after this spend. Null for a frame. */
  extra_listings: number | null;
}

// ───────────── Contact reveals ─────────────

/**
 * What the signed-in user may do about seeing phone numbers today.
 * The free allowance is per Kabul calendar day; credits and perks are described in the API docs.
 */
export interface ContactQuota {
  /** Free reveals per day for a regular account. */
  free_limit: number;
  free_used: number;
  free_remaining: number;
  /** Prepaid or earned credits left (they never expire). Includes `referral_credits`. */
  credits: number;
  /** The part of `credits` that came from inviting friends or joining through a friend. */
  referral_credits: number;
  /** True for accounts with the agency perks: reveals are never limited or charged. */
  unlimited: boolean;
  unlimited_reason: PerkReason | null;
  /** When the free allowance refills (the next Kabul midnight). */
  resets_at: string;
}

/** GET /properties/:id/contact and the result of unlocking. `contact` is null while locked. */
export interface ContactAccess {
  unlocked: boolean;
  /** True when the signed-in user owns the listing (their own number, never counted or charged). */
  is_owner: boolean;
  contact: PropertyContact | null;
  quota: ContactQuota;
  /** How this reveal was paid for; set on the call that unlocked it, null when it was already unlocked or free of charge. */
  paid_with: ContactUnlockMethod | null;
}

/** The body of the 403 returned when a reveal is not allowed any more today. */
export interface ContactLimitReachedBody extends ApiErrorBody {
  code: "CONTACT_LIMIT_REACHED";
  quota: ContactQuota;
}

// ───────────── Chat ─────────────

/** What the chat screens need to know about the signed-in user's abilities. */
export interface ChatCapabilities {
  /** Agency perks: map pins, high-quality photos, saved replies and the automatic reply. */
  advanced: boolean;
  advanced_reason: PerkReason | null;
  limits: {
    text_max_length: number;
    /** Largest picture upload for this account, in bytes. */
    image_max_bytes: number;
    template_max_length: number;
    templates_max: number;
  };
}

/** The listing a chat is about, shown at the top of the conversation. */
export interface ChatPropertySummary {
  id: string;
  title: string;
  price: number;
  currency: Currency;
  province: string;
  district: string;
  status: PropertyStatus;
  /** First picture of the listing, or null. */
  cover_image: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: MessageType;
  /** The text; for IMAGE and LOCATION an optional caption. */
  body: string | null;
  /** IMAGE: API path to download the picture (needs the access token), e.g. /chat/images/<id>. */
  image_url: string | null;
  /** LOCATION: the pin. */
  lat: number | null;
  lng: number | null;
  /** Sent automatically from the seller's auto-reply, not typed by them. */
  is_auto_reply: boolean;
  /** The sender's own id for this message, used to match the optimistic copy and to retry safely. */
  client_id: string;
  /** When the other person saw it; null while unread. */
  read_at: string | null;
  created_at: string;
}

export interface ChatCounterpart {
  id: string;
  /** The person's name. For an agency listing this is the agency's name. */
  name: string | null;
}

export interface ChatConversation {
  id: string;
  property: ChatPropertySummary;
  counterpart: ChatCounterpart;
  /** Whether the signed-in user is the one asking about the listing or the one who owns it. */
  my_role: "BUYER" | "SELLER";
  last_message: ChatMessage | null;
  /** Messages from the other person that the signed-in user has not read. */
  unread_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatMessagesPage {
  /** Newest first. */
  data: ChatMessage[];
  /** Pass as `before` to get the next older page; null when there is nothing older. */
  next_cursor: string | null;
}

export interface ChatTemplate {
  id: string;
  body: string;
  /** Sent automatically to a buyer's first message. At most one template has this on. */
  is_auto_reply: boolean;
  created_at: string;
}

export interface ChatImageUploaded {
  id: string;
  url: string;
  content_type: string;
  byte_size: number;
}

/** Socket events the server sends (names are in CHAT_EVENTS in @bongah/shared-types). */
export interface ChatTypingEvent {
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
}

export interface ChatReadEvent {
  conversation_id: string;
  /** Who read: their messages sent TO them in this conversation are now read. */
  reader_id: string;
  read_at: string;
}

/** The acknowledgement of `message:send`. */
export type ChatSendAck =
  | { ok: true; message: ChatMessage }
  | {
      ok: false;
      code: string;
      message: string;
      status: number;
      retry_after?: number;
    };

// ───────────── Wallet, payments and receipts ─────────────

/** One payment as the payer sees it (the payment list and the wallet). */
export interface PaymentSummary extends Transaction {
  paid_at: string | null;
  /** Set exactly when the payment succeeded. */
  receipt_number: string | null;
  package_type: SubscriptionPackage | null;
  /** Contact credits bought, or days of featured badge bought. */
  quantity: number | null;
  property_title: string | null;
  method?: TransactionMethod;
  /** MANUAL: the receipt picture is on file (the payment waits for a person to look at it). */
  receipt_uploaded?: boolean;
  /** MANUAL: the transaction id the customer typed in (instead of, or besides, the picture). */
  reference?: string | null;
  /** Why a manual payment was refused; set exactly when it was. */
  review_note?: string | null;
}

/** GET /hesabpay/payments/:id/receipt: what the app shows (and shares) as the digital receipt. */
export interface Receipt {
  receipt_number: string;
  payment_id: string;
  /** When the payment was confirmed. */
  issued_at: string;
  purpose: TransactionPurpose;
  package_type: SubscriptionPackage | null;
  quantity: number | null;
  property: { id: string; title: string } | null;
  amount: number;
  currency: Currency;
  payer: {
    full_name: string | null;
    phone_number: string;
    agency_name: string | null;
  };
  /** HesabPay's own reference for the payment, for support questions. */
  reference: string;
}

/** A subscription bought in advance, starting when the running one ends. */
export interface QueuedSubscription {
  package_type: SubscriptionPackage;
  starts_at: string;
  ends_at: string;
}

export interface WalletSubscription {
  is_active: boolean;
  package_type: SubscriptionPackage | null;
  /** When the running plan started; null when not active. */
  started_at: string | null;
  /** When publishing rights end, counting plans bought in advance; null when not active. */
  ends_at: string | null;
  /** Whole days left, rounded up. 0 when not active. */
  remaining_days: number;
  /** Seconds left (for a live countdown); 0 when not active. Count down from `Wallet.server_time`, not the phone's clock. */
  remaining_seconds: number;
  queued: QueuedSubscription[];
}

/** How many listings the signed-in user can still publish, as GET /wallet reports it. */
export interface ListingQuota {
  /**
   * What the period allows: a regular user's free listings for the Kabul month, an office's listings in the running
   * plan. 0 for an office with no running plan; null when there is no limit (an admin).
   */
  limit: number | null;
  /** How many of `limit` are already used. */
  used: number;
  /** Gift listings on top of `limit` (the welcome gift, or the first-subscription bonus) that are still unspent. */
  extra: number;
  /** When the allowance refills (a regular user's next Kabul month); null when it does not refill on a date. */
  resets_at: string | null;
}

/**
 * The free period a new agency starts with: it can publish listings without a subscription until `ends_at` or until
 * `listings_limit` listings are published, whichever comes first.
 */
export interface AgencyTrial {
  /** Running now: before `ends_at`. (A used-up allowance does not end the trial; see `listings_used`.) */
  is_active: boolean;
  ends_at: string;
  remaining_days: number;
  listings_limit: number;
  listings_used: number;
}

/** GET /wallet: everything the signed-in user has bought or earned, in one call. */
export interface Wallet {
  /** The server's clock when this was computed, so a countdown does not depend on the phone's clock. */
  server_time: string;
  /** Null for accounts without an agency profile. */
  subscription: WalletSubscription | null;
  map_location: MapLocationStatus;
  contact_credits: number;
  contact_unlimited: boolean;
  ladder_tokens: number;
  /** Listings still available to publish. Absent from servers that predate it. */
  listing_quota?: ListingQuota;
  /** The free trial of an agency: null for everyone else. Absent from servers that predate it. */
  trial?: AgencyTrial | null;
  /** The five newest payments. */
  recent_payments: PaymentSummary[];
}

// ───────────── Agency analytics ─────────────

export interface AgencyAnalyticsDay {
  /** Kabul calendar date, YYYY-MM-DD. */
  day: string;
  views: number;
  leads: number;
  phone_reveals: number;
}

export interface AgencyListingStats {
  id: string;
  title: string;
  status: PropertyStatus;
  views: number;
  leads: number;
  phone_reveals: number;
}

/**
 * GET /agencies/me/analytics. Days are Kabul calendar days; `series` has one entry per day, zeros included.
 *  - views: times the agency's listings were opened (counted per day since daily counts began);
 *  - leads: people who started a chat about a listing and sent at least one message;
 *  - phone_reveals: times someone unlocked the agency's phone number from one of its listings.
 */
export interface AgencyAnalytics {
  range: { from: string; to: string; days: number };
  totals: { views: number; leads: number; phone_reveals: number };
  series: AgencyAnalyticsDay[];
  /** The listings with the most activity in the range (at most 20), busiest first. */
  listings: AgencyListingStats[];
  /** Every view the agency's listings ever got, including those counted before daily numbers existed. */
  lifetime_views: number;
}

// ───────────── Property pictures and bulk operations ─────────────

export interface PropertyImageUploaded {
  id: string;
  /** Absolute public URL: put it in a listing's `images`. */
  url: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface PropertyImageItem extends PropertyImageUploaded {
  /** The caller's listings that use this picture. */
  used_by_property_ids: string[];
}

/** The answer for one row of a bulk request. `index` is the row's position in the request. */
export type BulkRowResult<T> =
  | { index: number; ok: true; property: T }
  | {
      index: number;
      ok: false;
      code: string;
      message: string;
      errors?: { field: string; message: string }[];
    };

export interface BulkResponse<T> {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkRowResult<T>[];
}

// ───────────── Moderation ─────────────

/** A person as an admin sees them in lists and reports. */
export interface AdminPerson {
  id: string;
  full_name: string | null;
  phone_number: string;
  banned_at: string | null;
}

export interface AbuseReportItem {
  id: string;
  status: AbuseReportStatus;
  target_type: AbuseTargetType;
  reason: AbuseReason;
  details: string | null;
  created_at: string;
  reporter: AdminPerson;
  /** The reported account (for a listing report: the listing's owner when it was filed). */
  target_user: AdminPerson;
  target_property: {
    id: string;
    title: string;
    status: PropertyStatus;
    removed_by_admin_at: string | null;
  } | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface AdminUserItem extends AdminPerson {
  role: Role;
  ban_reason: string | null;
  last_login_at: string | null;
  created_at: string;
  agency: {
    id: string;
    agency_name: string;
    verification_status: AgencyVerificationStatus;
  } | null;
  open_reports_against: number;
}

export interface AdminUserDetail extends AdminUserItem {
  listings: { active: number; sold: number; archived: number };
  reports_filed: number;
  reports_against: number;
}

export interface AdminAgencyItem {
  id: string;
  agency_name: string;
  license_photo: string;
  address: string;
  description: string | null;
  verification_status: AgencyVerificationStatus;
  is_verified: boolean;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  owner: AdminPerson;
  subscription_active: boolean;
}

export interface AdminPropertyItem extends Property {
  view_count: number;
  removed_by_admin_at: string | null;
  removal_reason: string | null;
  owner: AdminPerson;
}

export interface AdminTransactionItem extends PaymentSummary {
  /** HesabPay's id for the payment session. */
  hesabpay_tx_id: string;
  user: AdminPerson;
  agency_name: string | null;
  /** When the receipt picture arrived; null when there is none. */
  proof_uploaded_at: string | null;
  /** When the transaction id was typed in; null when none was. */
  reference_submitted_at: string | null;
  /** When an admin decided (approved, forced or refused), and who. */
  reviewed_at: string | null;
  reviewed_by: AdminPerson | null;
  /** Activated by an admin without a receipt picture. */
  force_activated: boolean;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /** Null for actions taken from the command line. */
  actor: AdminPerson | null;
}

// ───────────── Banners and prices ─────────────

export interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_property_id: string | null;
  link_url: string | null;
  placement: BannerPlacement;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One paid product in the admin price list. `price`/`quantity` are what customers pay now. */
export interface PricingEntry {
  key: PricingKey;
  price: number;
  /** Featured days (FEATURED_AD) or credits per pack (CONTACT_CREDITS); null for the others. */
  quantity: number | null;
  /** True when an admin changed it; false when the environment default applies. */
  overridden: boolean;
  default_price: number;
  default_quantity: number | null;
  updated_at: string | null;
}

// ───────────── Admin overview ─────────────

export interface MoneyByCurrency {
  currency: Currency;
  total: number;
}

/** GET /admin/analytics/overview. Money is never added across currencies: every figure is per currency. */
export interface AdminOverview {
  generated_at: string;
  range: { from: string; to: string; days: number };
  revenue: {
    all_time: MoneyByCurrency[];
    in_range: MoneyByCurrency[];
    by_purpose: {
      purpose: TransactionPurpose;
      currency: Currency;
      total: number;
      count: number;
    }[];
    /** Only days that had revenue. */
    daily: { day: string; currency: Currency; total: number }[];
  };
  payments: {
    /** In the range. */
    succeeded: number;
    failed: number;
    pending: number;
    /** Payments still PENDING after an hour, ever: unpaid, or paid but the confirmation never matched. */
    pending_over_one_hour: number;
  };
  listings: {
    active: number;
    sold: number;
    archived: number;
    featured_now: number;
    new_in_range: number;
    removed_by_admin: number;
  };
  users: {
    total: number;
    by_role: Record<Role, number>;
    new_in_range: number;
    /** Signed in during the last 30 days. */
    active_30d: number;
    banned: number;
    /** One entry per day of the range, zeros included. */
    daily_signups: { day: string; count: number }[];
  };
  agencies: { with_active_subscription: number; verified: number };
  moderation: { open_reports: number; pending_verifications: number };
}

/** The answer to POST /reports. */
export interface ReportFiled {
  id: string;
  status: AbuseReportStatus;
  created_at: string;
}

/** The answer to POST /feedback. */
export interface FeedbackReceived {
  id: string;
  created_at: string;
}

// ───────────── Welcome card and morning quotes ─────────────

/** An admin's quote template. */
export interface DailyQuote {
  id: string;
  text: string;
  category: QuoteCategory;
  language: Language;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** What the app shows in the welcome card (GET /quotes/welcome). */
export interface WelcomeQuote {
  id: string;
  text: string;
  language: Language;
}

/** One Kabul day of the morning push, for the admin screen. */
export interface MorningPushDay {
  /** YYYY-MM-DD, Kabul. */
  day: string;
  claimed: number;
  sent: number;
  failed: number;
}

/** POST /admin/notifications/test */
export interface TestPushResult {
  devices: number;
  delivered: number;
  failed: number;
}

// ───────────────────────── Places and routes (GET /geo/*) ─────────────────────────

/**
 * One row of the place search's dropdown. `id` is the provider's own place id: coordinates are only fetched when the
 * row is chosen (GET /geo/places/:id), which is how Google and Mapbox bill a search session. Some answers already
 * carry the coordinate; then `lat`/`lng` are set and no second call is needed.
 */
export interface PlaceSuggestion {
  id: string;
  provider: GeoProvider;
  title: string;
  /** Where it is, wide to narrow, without the title: "ناحیه ۲، کابل". Empty when the provider said nothing more. */
  subtitle: string;
  /** What kind of place, when known ("hospital", "university", "cafe"), for the row's icon. */
  category: string | null;
  lat: number | null;
  lng: number | null;
}

export interface PlaceSuggestions {
  data: PlaceSuggestion[];
}

/** A chosen place with its coordinate (GET /geo/places/:id) or what is at a coordinate (GET /geo/reverse). */
export interface PlaceDetails {
  provider: GeoProvider;
  title: string;
  /** The whole address in one line, as the provider writes it. */
  address: string;
  lat: number;
  lng: number;
  /** The province as the provider names it ("Kabul", "ولایت نیمروز"), or null. The app matches it to its own list. */
  province: string | null;
  district: string | null;
  neighborhood: string | null;
  street: string | null;
}

/** A driving route (GET /geo/route): its line from start to end, and how long and how far it is. */
export interface RouteResult {
  provider: GeoProvider;
  distance_m: number;
  duration_s: number;
  /** [longitude, latitude] pairs, start first. */
  coordinates: [number, number][];
}

// ───────────── Agency panel (web) ─────────────

/** One of the agency's listings as the office map needs it: small, with the pin (null when it has none yet). */
export interface AgencyListingPin {
  id: string;
  title: string;
  type: PropertyType;
  deal_type: DealType;
  status: PropertyStatus;
  price: number;
  currency: Currency;
  province: string;
  district: string;
  address: string;
  lat: number | null;
  lng: number | null;
  /** True only while a paid featured promotion is running. */
  is_featured: boolean;
}

/** GET /agencies/me/properties/map: every listing the agency still has (archived ones are left out). */
export interface AgencyMapListings {
  data: AgencyListingPin[];
  /** The agency's own office pin (null until placed). Unlike the public map, it does not depend on being verified. */
  office: { lat: number; lng: number } | null;
  /** True when the agency has more listings than one answer carries (see `limit`); the newest are sent. */
  truncated: boolean;
  limit: number;
}
