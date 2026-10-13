// Enum values here MUST match the Prisma enums in apps/api/prisma/schema.prisma exactly:
// they are what the API sends and accepts on the wire.

// prs = Dari (Afghan Persian), ps = Pashto. Both are written right-to-left.
export const LANGUAGES = ['prs', 'ps'] as const;
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
export const TRANSACTION_PURPOSES = [
  'SUBSCRIPTION',
  'LADDER',
  'FEATURED_AD',
  'MAP_LOCATION',
  'CONTACT_CREDITS',
] as const;
/** Why an account may pin exact coordinates without paying per listing. */
export const MAP_LOCATION_UNLIMITED_REASONS = ['AGENCY_SUBSCRIPTION', 'ADMIN'] as const;
/**
 * Why an account gets the agency perks: unlimited contact reveals and the advanced chat tools
 * (map pins, high-quality photos, saved and automatic replies). ADMIN is for staff accounts.
 */
export const PERK_REASONS = ['AGENCY_SUBSCRIPTION', 'ADMIN'] as const;
export const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'LOCATION'] as const;
export const CONTACT_UNLOCK_METHODS = ['FREE_DAILY', 'CREDIT', 'PERK'] as const;
export const CONTACT_CREDIT_SOURCES = ['PURCHASE', 'REFERRAL', 'ADMIN_GRANT'] as const;
/** What a reward grants. Only LADDER_TOKEN has an effect today; the others are reserved. */
export const REWARD_TYPES = ['LADDER_TOKEN', 'BONUS_LISTING', 'SUBSCRIPTION_EXTENSION'] as const;
/** Why a reward was granted: for inviting a friend, or for joining through a friend's code. */
export const REWARD_REASONS = ['REFERRER_BONUS', 'REFEREE_BONUS'] as const;
export const TRANSACTION_STATUSES = ['PENDING', 'SUCCESS', 'FAILED'] as const;

// ───────────── Admin panel, moderation and agency tools ─────────────

export const AGENCY_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export const ABUSE_TARGET_TYPES = ['USER', 'PROPERTY'] as const;
export const ABUSE_REASONS = ['SCAM', 'FAKE_LISTING', 'HARASSMENT', 'SPAM', 'WRONG_INFORMATION', 'OTHER'] as const;
export const ABUSE_REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
/**
 * What an admin can decide about an open report:
 *  - DISMISS: nothing wrong;  RESOLVE: handled outside the system (a warning, say);
 *  - BAN_USER: ban the reported account;  REMOVE_LISTING: take the reported listing down (listing reports only).
 */
export const REPORT_RESOLUTION_ACTIONS = ['DISMISS', 'RESOLVE', 'BAN_USER', 'REMOVE_LISTING'] as const;
export const BANNER_PLACEMENTS = ['HOME_TOP', 'SEARCH_TOP'] as const;
/** The paid products whose price an admin can change. */
export const PRICING_KEYS = [
  'SUBSCRIPTION_MONTHLY',
  'SUBSCRIPTION_QUARTERLY',
  'SUBSCRIPTION_YEARLY',
  'LADDER',
  'FEATURED_AD',
  'MAP_LOCATION',
  'CONTACT_CREDITS',
] as const;
/** Most rows one bulk upload / bulk edit request may carry. */
export const QUOTE_CATEGORIES = ['WELCOME_ONBOARDING', 'MORNING_NOTIFICATION'] as const;
export const PUSH_PLATFORMS = ['ANDROID', 'IOS'] as const;
/** Longest quote the welcome card and the push body accept. */
export const QUOTE_MAX_LENGTH = 500;
/** A user keeps at most this many registered phones; registering another drops the one not seen for longest. */
export const PUSH_MAX_DEVICES_PER_USER = 5;

export const BULK_MAX_ITEMS = 50;
/** Most pictures one listing may carry (the same limit the listing schema enforces). */
export const PROPERTY_MAX_IMAGES = 20;

export type Language = (typeof LANGUAGES)[number];
export type Role = (typeof ROLES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type DealType = (typeof DEAL_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type SubscriptionPackage = (typeof SUBSCRIPTION_PACKAGES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];
export type RewardType = (typeof REWARD_TYPES)[number];
export type RewardReason = (typeof REWARD_REASONS)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type AgencyVerificationStatus = (typeof AGENCY_VERIFICATION_STATUSES)[number];
export type AbuseTargetType = (typeof ABUSE_TARGET_TYPES)[number];
export type AbuseReason = (typeof ABUSE_REASONS)[number];
export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number];
export type ReportResolutionAction = (typeof REPORT_RESOLUTION_ACTIONS)[number];
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];
export type PricingKey = (typeof PRICING_KEYS)[number];
export type MapLocationUnlimitedReason = (typeof MAP_LOCATION_UNLIMITED_REASONS)[number];
export type PerkReason = (typeof PERK_REASONS)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type ContactUnlockMethod = (typeof CONTACT_UNLOCK_METHODS)[number];
export type ContactCreditSource = (typeof CONTACT_CREDIT_SOURCES)[number];

/** Longest chat text message (characters). */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;
/** Longest saved reply / auto-reply (characters). */
export const CHAT_TEMPLATE_MAX_LENGTH = 500;
/** Saved replies one account may keep. */
export const CHAT_MAX_TEMPLATES = 10;
/** Picture formats a chat accepts. */
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ChatImageType = (typeof CHAT_IMAGE_TYPES)[number];

/** Afghanistan's bounding box. A sanity check on map pins, not a border: it includes slivers of neighbours. */
export const AFGHANISTAN_BOUNDS = {
  minLat: 29.3,
  maxLat: 38.6,
  minLng: 60.4,
  maxLng: 75.0,
} as const;

/** Socket.io event names, shared so the server and the app cannot drift apart. */
export const CHAT_EVENTS = {
  /** client -> server: send a message (acknowledged). */
  send: 'message:send',
  /** client -> server and server -> client: someone started / stopped typing. */
  typing: 'typing',
  /** client -> server: I read this conversation. server -> client: the other person did. */
  read: 'message:read',
  /** server -> client: a new message in one of my conversations. */
  newMessage: 'message:new',
} as const;
