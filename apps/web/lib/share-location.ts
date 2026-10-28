/**
 * Sending a property's exact place to a client: a short message with a map link anyone's phone can open, the
 * coordinates as plain text (they work in any app, link or not), and the listing's own link when it has one.
 *
 * The map link is the universal "show this point" address, which opens the maps app the client already has. It is
 * only a link: nothing here calls a maps service, so it costs nothing and needs no key. The phone app builds the
 * same message from the same rules (apps/mobile/src/share/locationShare.ts): keep the two in step.
 */

/** Where a map link points. One place to change if another map should open for the client. */
export const MAP_LINK_BASE = 'https://www.google.com/maps/search/?api=1&query=';
/** The listing's public address (the same one the phone app shares). */
export const LISTING_LINK_BASE = 'https://bongah.app/listing/';

export interface SharedPlace {
  lat: number;
  lng: number;
  /** The listing's title, or whatever names the place. */
  title?: string;
  /** The address as a person would say it. */
  address?: string;
  /** The listing's id, when it has been saved: adds the link that opens it in the app. */
  listingId?: string | null;
}

const isCoordinate = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** "34.528100, 69.176100": six decimals is about 10 cm. Latin digits on purpose, so every maps app reads them. */
export function coordinateText(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** The link that opens this point in a maps app. */
export function mapLink(lat: number, lng: number): string {
  return `${MAP_LINK_BASE}${encodeURIComponent(`${lat.toFixed(6)},${lng.toFixed(6)}`)}`;
}

/** The link that opens the listing itself. */
export const listingLink = (id: string): string => `${LISTING_LINK_BASE}${encodeURIComponent(id)}`;

/** The words of the message, in the language shown. */
export interface ShareWords {
  /** «📍 {title}» (the title may be empty). */
  heading: (title: string) => string;
  /** «موقعیت دقیق روی نقشه:» (the map link follows on the next line). */
  mapLine: string;
  /** «مختصات: {coords}» */
  coordinates: (coords: string) => string;
  /** «مشخصات کامل در بنگاه:» (the listing link follows on the next line). */
  listingLine: string;
}

export interface ShareContent {
  /** The whole message, ready for any chat app. */
  text: string;
  /** The message without its map link: Telegram takes the link as a separate field and shows it as a preview. */
  textWithoutLink: string;
  /** The map link. */
  link: string;
}

/** The message for a place, or null when its position is not a real position. Pure. */
export function buildLocationShare(place: SharedPlace, words: ShareWords): ShareContent | null {
  if (!isCoordinate(place.lat) || !isCoordinate(place.lng)) return null;
  if (Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return null;
  const link = mapLink(place.lat, place.lng);
  const coords = coordinateText(place.lat, place.lng);
  const title = (place.title ?? '').replace(/\s+/g, ' ').trim();
  const address = (place.address ?? '').replace(/\s+/g, ' ').trim();
  const head = [words.heading(title), address].filter(Boolean);
  const tail = [words.coordinates(coords)];
  if (place.listingId) tail.push(words.listingLine, listingLink(place.listingId));
  const textWithoutLink = [...head, ...tail].join('\n');
  const text = [...head, words.mapLine, link, ...tail].join('\n');
  return { text, textWithoutLink, link };
}

/** The address that opens WhatsApp's "send to…" with the message filled in. */
export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** The address that opens Telegram's "send to…" with the link and the message filled in. */
export const telegramUrl = (link: string, text: string): string =>
  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
