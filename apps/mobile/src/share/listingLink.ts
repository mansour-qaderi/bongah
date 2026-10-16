/**
 * The address of a listing, as the app hands it to other apps.
 *
 * Today it is the app's own deep link, `bongah://listing/{id}`. The id is the listing's unique id (what the API calls
 * `id`), so the same link can be resolved by the app, by a future web page or by the dashboard. When a public web
 * address exists, change `LISTING_LINK_BASE` (for example to "https://bongah.af/listing/") and nothing else:
 * `listingLink` and `parseListingId` are the only places that know the shape.
 *
 * Nothing opens these links yet: the native URL scheme and the navigation's link handling are not set up, so for now
 * the link is the identifier that travels with a share, ready for that work.
 */
export const LISTING_LINK_BASE = 'bongah://listing/';

/** The link to share for the listing with this id. The id is encoded, so no id can break the link's shape. */
export function listingLink(id: string): string {
  return `${LISTING_LINK_BASE}${encodeURIComponent(id)}`;
}

/** The listing id inside one of our links, or null for anything else (another scheme, no id, extra path). */
export function parseListingId(url: string): string | null {
  const text = url.trim();
  if (!text.startsWith(LISTING_LINK_BASE)) return null;
  const rest = text.slice(LISTING_LINK_BASE.length).split(/[?#]/)[0];
  if (rest === '' || rest.includes('/')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}
