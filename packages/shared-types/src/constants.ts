// Enum values here MUST match the Prisma enums in apps/api/prisma/schema.prisma exactly:
// they are what the API sends and accepts on the wire.

// prs = Dari (Afghan Persian), ps = Pashto. Both are written right-to-left.
export const LANGUAGES = ['prs', 'ps'] as const;
export const ROLES = ['USER', 'AGENCY', 'ADMIN'] as const;
/**
 * The two markets the platform serves: AF = Afghanistan, IR = Iran. A market decides the currencies, the kinds of
 * deal and property on offer, the places (provinces, map area) and how a customer pays the platform. Enum values here
 * MUST match the Prisma enum `Market` exactly.
 */
export const MARKETS = ['AF', 'IR'] as const;
/** The market of everything that existed before markets did (and of anyone who has not chosen). */
export const DEFAULT_MARKET = 'AF' as const;
/**
 * The market a person starts in when their country cannot be told (location refused or unavailable). The apps and the
 * website detect the country from the device's position; when that gives nothing they open in Iran.
 */
export const FALLBACK_MARKET = 'IR' as const;
/**
 * The kinds of property, one each. Enum values here MUST match the Prisma enum `PropertyType` exactly. Which of them a
 * person is offered depends on the market (MARKET_CONFIG); this list is every value the API accepts and the apps can show.
 *   HOUSE_HAWILI حویلی, APARTMENT آپارتمان, SHOP دکان, OFFICE دفتر, LAND زمین, GARDEN باغ, VILLA ویلا, GARAGE گاراج,
 *   WAREHOUSE گدام, OTHER غیره        (Afghanistan)
 *   APARTMENT آپارتمان, HOUSE_HAWILI خانه / ویلایی, VILLA_GARDEN باغ و ویلا, LAND زمین, LAND_OLD خانه کلنگی,
 *   COMMERCIAL تجاری و اداری   (Iran; APARTMENT, HOUSE_HAWILI and LAND are shared with Afghanistan)
 * DUPLEX (دوبلکس) was an Iranian type for a while and is now a feature (PROPERTY_FEATURES); the value stays so listings
 * published as one keep working.
 */
export const PROPERTY_TYPES = [
  'HOUSE_HAWILI',
  'APARTMENT',
  'DUPLEX',
  'SHOP',
  'OFFICE',
  'COMMERCIAL',
  'WAREHOUSE',
  'LAND',
  'LAND_OLD',
  'GARDEN',
  'VILLA',
  'VILLA_GARDEN',
  'GARAGE',
  'OTHER',
] as const;
/**
 * Extra qualities of a property the owner ticks (tags), Iran's way of describing a flat or house. Which are offered
 * depends on the market (MARKET_CONFIG.features). Enum values here MUST match the Prisma enum `PropertyFeature`.
 *   DUPLEX دوبلکس, PENTHOUSE پنت‌هاوس, SINGLE_DEED سند تک‌برگ, MASTER_ROOM مستر روم, ELEVATOR آسانسور, PARKING پارکینگ,
 *   STORAGE انباری
 */
export const PROPERTY_FEATURES = [
  'DUPLEX',
  'PENTHOUSE',
  'SINGLE_DEED',
  'MASTER_ROOM',
  'ELEVATOR',
  'PARKING',
  'STORAGE',
] as const;
/**
 * The kind of ownership paper in Afghanistan: SHARI قباله شرعی (a sharia deed) or ORFI عرفی (customary, an informal
 * one). Enum values here MUST match the Prisma enum `DeedType`.
 */
export const DEED_TYPES = ['SHARI', 'ORFI'] as const;
/**
 * Longest "unit" a listing may carry (واحد): free text such as "واحد ۳" or "طبقه دوم". It says which unit of a
 * building is for sale or rent; it has no fixed list.
 */
export const PROPERTY_UNIT_MAX_LENGTH = 40;
/**
 * SALE (فروشی / فروش), RENT (کرایه), MORTGAGE_GROWI, MORTGAGE_RENT (Iran's اجاره: a deposit and a monthly rent) and DAILY_RENT (اجاره
 * روزانه: short stays, by the day).
 * MORTGAGE_GROWI is one deal with two names: the owner holds a deposit and gives it back at the end. Afghanistan calls
 * it گروی, Iran رهن کامل; the market picks the word, the value is the same.
 * MORTGAGE_RENT is Iran's mix of the two: a smaller deposit (the listing's `price`) AND a rent every month
 * (`monthly_rent`), both in the listing's currency.
 */
export const DEAL_TYPES = ['SALE', 'RENT', 'MORTGAGE_GROWI', 'MORTGAGE_RENT', 'DAILY_RENT'] as const;
/** The kinds of property a daily rental may be (a villa or a garden let by the day). */
export const DAILY_RENT_TYPES = ['VILLA', 'GARDEN', 'VILLA_GARDEN'] as const;
/**
 * What the price of a listing means: FIXED ("مقطوع", the owner will not bargain) or NEGOTIABLE ("جورآمد", open to an
 * offer). A listing may say neither (null).
 */
export const PRICE_TERMS = ['FIXED', 'NEGOTIABLE'] as const;
/** Longest mortgage (گروی) a listing may state, in months: fifty years. */
export const MORTGAGE_MONTHS_MAX = 600;
/** AFGHANI (AFN), TOMAN and RIAL (Iran: 1 toman = 10 rials; prices are said in toman, banks count in rials), USD. */
export const CURRENCIES = ['AFGHANI', 'USD', 'TOMAN', 'RIAL'] as const;
export const PROPERTY_STATUSES = ['ACTIVE', 'SOLD', 'ARCHIVED'] as const;
export const SUBSCRIPTION_PACKAGES = [
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY',
] as const;
/** Calendar months each subscription package lasts. */
export const SUBSCRIPTION_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
} as const satisfies Record<(typeof SUBSCRIPTION_PACKAGES)[number], number>;
/**
 * The discount each plan is sold with, in percent off the list price (the monthly list price times the months).
 * The longer the plan, the bigger the discount. The prices actually charged come from the server; where a price
 * has been set by hand the real discount can differ, and `Pricing.subscription_list` lets the app work out the real one.
 */
export const SUBSCRIPTION_DISCOUNT_PERCENT = {
  MONTHLY: 10,
  QUARTERLY: 20,
  SEMIANNUAL: 35,
  YEARLY: 50,
} as const satisfies Record<(typeof SUBSCRIPTION_PACKAGES)[number], number>;
/** The plan the app calls the best offer. */
export const BEST_SUBSCRIPTION_PACKAGE = 'YEARLY' as const;
/**
 * What one month of an agency subscription costs before any discount, in the account currency. It anchors every plan:
 * a plan's list price is this times its months, and it is sold at that less the plan's discount (900 a month, 2400
 * for three, 3900 for six, 6000 for a year). A price set by hand (settings or the admin panel) still wins.
 */
export const SUBSCRIPTION_BASE_MONTHLY_PRICE = 1000;
/**
 * What each plan includes. `listings` is how many listings the agency may publish during that one plan (counted from the
 * plan's start to its end; a plan bought in advance has its own count when it begins). `gift_listings` and
 * `gift_featured` are the launch gifts: extra listing credits (used after the plan's own listings) and free
 * featured-listing credits (each makes one listing featured for the usual number of days). `business_accounting` and
 * `public_portfolio` are the two features advertised on the plan cards.
 */
export interface PlanBenefits {
  listings: number;
  gift_listings: number;
  gift_featured: number;
  business_accounting: boolean;
  public_portfolio: boolean;
}
export const SUBSCRIPTION_PLAN_BENEFITS = {
  MONTHLY: { listings: 8, gift_listings: 2, gift_featured: 1, business_accounting: true, public_portfolio: false },
  QUARTERLY: { listings: 18, gift_listings: 6, gift_featured: 3, business_accounting: true, public_portfolio: true },
  SEMIANNUAL: { listings: 30, gift_listings: 9, gift_featured: 6, business_accounting: true, public_portfolio: true },
  YEARLY: { listings: 60, gift_listings: 15, gift_featured: 12, business_accounting: true, public_portfolio: true },
} as const satisfies Record<(typeof SUBSCRIPTION_PACKAGES)[number], PlanBenefits>;
/**
 * true: the launch gifts are given with an account's first subscription only (a later purchase adds none).
 * false: every subscription purchase brings the gifts of its plan.
 */
export const LAUNCH_GIFTS_ONCE_PER_ACCOUNT = true;
/**
 * The featured-listing bundles that can be bought ahead of time, as a number of featured listings and the discount
 * on the single price times that number (3 for 270, 5 for 400, 10 for 650, 20 for 1100 when one costs 100). The
 * "bundle" of 1 is a single featured listing bought as a credit, at full price: the payment screen needs no listing
 * to be chosen first, and the credit is spent on a listing afterwards. A featured listing can still be bought
 * directly for one listing (`FEATURED_AD`) from that listing's own promotion sheet.
 */
export const FEATURED_BUNDLE_SIZES = [1, 3, 5, 10, 20] as const;
export const FEATURED_BUNDLE_DISCOUNT_PERCENT = { 1: 0, 3: 10, 5: 20, 10: 35, 20: 45 } as const satisfies Record<
  (typeof FEATURED_BUNDLE_SIZES)[number],
  number
>;
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED'] as const;
export const TRANSACTION_PURPOSES = [
  'SUBSCRIPTION',
  'LADDER',
  'FEATURED_AD',
  'MAP_LOCATION',
  'CONTACT_CREDITS',
  'FEATURED_CREDITS',
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
/** What ladders (نردبان) can be spent on: one more listing, or a featured frame on one listing. */
export const LADDER_SPEND_PURPOSES = ['LISTING_QUOTA', 'FEATURED_FRAME'] as const;
export type LadderSpendPurpose = (typeof LADDER_SPEND_PURPOSES)[number];
/** Ladders one more listing costs (once the free ones are used up). */
export const LADDERS_PER_LISTING = 3;
/** Ladders a featured frame (کادر ویژه) on one listing costs. */
export const LADDERS_PER_FRAME = 7;
/** What each purpose costs, in ladders. */
export const LADDER_SPEND_COST: Record<LadderSpendPurpose, number> = {
  LISTING_QUOTA: LADDERS_PER_LISTING,
  FEATURED_FRAME: LADDERS_PER_FRAME,
};
export const TRANSACTION_STATUSES = ['PENDING', 'SUCCESS', 'FAILED'] as const;
/**
 * How a payment is settled. GATEWAY: HesabPay confirms it with a webhook. MANUAL: the customer sends the money
 * themselves (HesabPay app or card-to-card) and uploads the receipt, and an admin confirms it by hand.
 */
export const TRANSACTION_METHODS = ['GATEWAY', 'MANUAL'] as const;

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
  'SUBSCRIPTION_SEMIANNUAL',
  'SUBSCRIPTION_YEARLY',
  'LADDER',
  'FEATURED_AD',
  'MAP_LOCATION',
  'CONTACT_CREDITS',
] as const;
/** Most rows one bulk upload / bulk edit request may carry. */
export const QUOTE_CATEGORIES = ['WELCOME_ONBOARDING', 'MORNING_NOTIFICATION'] as const;
/** What a piece of feedback from the Account tab is about. */
export const FEEDBACK_CATEGORIES = ['SUGGESTION', 'PROBLEM', 'PRAISE', 'OTHER'] as const;
/** Shortest and longest feedback message (characters). */
export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 1000;
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
export type Market = (typeof MARKETS)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type DealType = (typeof DEAL_TYPES)[number];
export type PriceTerms = (typeof PRICE_TERMS)[number];
export type PropertyFeature = (typeof PROPERTY_FEATURES)[number];
export type DeedType = (typeof DEED_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];
export type SubscriptionPackage = (typeof SUBSCRIPTION_PACKAGES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type TransactionPurpose = (typeof TRANSACTION_PURPOSES)[number];
export type RewardType = (typeof REWARD_TYPES)[number];
export type RewardReason = (typeof REWARD_REASONS)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
export type TransactionMethod = (typeof TRANSACTION_METHODS)[number];
export type AgencyVerificationStatus = (typeof AGENCY_VERIFICATION_STATUSES)[number];
export type AbuseTargetType = (typeof ABUSE_TARGET_TYPES)[number];
export type AbuseReason = (typeof ABUSE_REASONS)[number];
export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number];
export type ReportResolutionAction = (typeof REPORT_RESOLUTION_ACTIONS)[number];
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
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
/** Iran's bounding box, with the same meaning as Afghanistan's. */
export const IRAN_BOUNDS = {
  minLat: 25.0,
  maxLat: 39.8,
  minLng: 44.0,
  maxLng: 63.4,
} as const;
/** One box around both markets: what a map view (a search, a viewport) may ask for. A pin is checked against its own market's box. */
export const SUPPORTED_BOUNDS = {
  minLat: Math.min(AFGHANISTAN_BOUNDS.minLat, IRAN_BOUNDS.minLat),
  maxLat: Math.max(AFGHANISTAN_BOUNDS.maxLat, IRAN_BOUNDS.maxLat),
  minLng: Math.min(AFGHANISTAN_BOUNDS.minLng, IRAN_BOUNDS.minLng),
  maxLng: Math.max(AFGHANISTAN_BOUNDS.maxLng, IRAN_BOUNDS.maxLng),
} as const;

/**
 * A plot outline a person draws on the listing form (the plot of a house, a piece of land, a garden). A drawn plot has
 * a few dozen corners at most; the cap keeps a broken or hostile payload small. The area limits match `area_sqm`:
 * below 10 m² it is a misplaced tap, not a plot.
 */
export const PLOT_MAX_VERTICES = 200;
export const PLOT_MIN_AREA_SQM = 10;
export const PLOT_MAX_AREA_SQM = 100_000_000;

/** Where the server's place search / route answers came from (`/geo/*`). Nominatim and OSRM are asked by the app itself. */
export const GEO_PROVIDERS = ['google', 'mapbox'] as const;
export type GeoProvider = (typeof GEO_PROVIDERS)[number];
/** Longest text the place search accepts. */
export const PLACE_QUERY_MAX_LENGTH = 120;

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
