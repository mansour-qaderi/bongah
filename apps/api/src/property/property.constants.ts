/** Listings a regular user may create per calendar month without paying. */
export const FREE_LISTINGS_PER_MONTH = 1;

/**
 * Gift listings a newly registered user starts with. The first listing they post uses one up, and it does not count
 * toward FREE_LISTINGS_PER_MONTH: the gift is an extra listing, not a replacement.
 */
export const WELCOME_LISTING_CREDITS = 1;

/** Afghanistan uses UTC+4:30 all year (no daylight saving). "Month" means a Kabul calendar month. */
export const KABUL_UTC_OFFSET_MS = 4.5 * 60 * 60 * 1000;
