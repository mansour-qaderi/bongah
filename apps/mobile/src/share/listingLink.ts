/**
 * The address of a listing, as the app hands it to other apps, and the way back from an address to the listing.
 *
 * What is shared is the web address, `https://bongah.app/listing/{id}`: it works in every chat app as a tappable
 * link, opens the app straight on the listing when the app is installed (Android App Links / iOS Universal Links)
 * and can later land on a web page for people who do not have it. The app's own address, `bongah://listing/{id}`
 * (`listingDeepLink`), opens the same listing and is what the phone falls back on when the web address is not
 * verified yet. `id` is the listing's unique id (what the API calls `id`), encoded, so no id can break the link's
 * shape.
 *
 * `parseListingId` / `parseListingPath` accept both shapes (and the older shares that carried `bongah://`), so what
 * is handed out and what is understood cannot drift apart. They are the only places that know the shapes; the
 * navigation's link handling (`navigation/linking.ts`) builds on them.
 */
export const LISTING_WEB_HOST = 'bongah.app';
export const LISTING_APP_SCHEME = 'bongah';

/** What is shared. */
export const LISTING_LINK_BASE = `https://${LISTING_WEB_HOST}/listing/`;
/** The app's own address for the same listing. */
export const LISTING_APP_LINK_BASE = `${LISTING_APP_SCHEME}://listing/`;

/** The link to share for the listing with this id: `https://bongah.app/listing/{id}`. */
export function listingLink(id: string): string {
  return `${LISTING_LINK_BASE}${encodeURIComponent(id)}`;
}

/** The app's own link for the listing with this id: `bongah://listing/{id}`. */
export function listingDeepLink(id: string): string {
  return `${LISTING_APP_LINK_BASE}${encodeURIComponent(id)}`;
}

// "bongah://", or "https://bongah.app/" (also with www.). Only https: a plain-http address is never ours.
const OUR_PREFIX = new RegExp(
  `^(?:${LISTING_APP_SCHEME}://|https://(?:www\\.)?${LISTING_WEB_HOST.replace(
    '.',
    '\\.',
  )}/?)`,
  'i',
);
// "listing/{id}", optionally with a leading slash, a trailing slash, a query or a fragment. Nothing else.
const LISTING_PATH = /^\/?listing\/([^/?#]+)\/?(?:[?#].*)?$/i;

/** The listing id in a path like `listing/abc` or `/listing/abc?x=1`, or null for any other path. */
export function parseListingPath(path: string): string | null {
  const match = LISTING_PATH.exec(path.trim());
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The listing id inside one of our links, or null for anything else (another scheme or host, no id, extra path). */
export function parseListingId(url: string): string | null {
  const text = url.trim();
  const prefix = OUR_PREFIX.exec(text);
  if (!prefix) return null;
  return parseListingPath(text.slice(prefix[0].length));
}
