import { Platform } from 'react-native';

/**
 * Where the Bongah API lives.
 *
 * In development the API runs on the developer's computer: the Android emulator reaches it at
 * 10.0.2.2, the iOS simulator at localhost. A physical phone needs the computer's LAN address
 * instead — set DEV_API_HOST below. Release builds (`__DEV__` false) use PRODUCTION_API_URL, which must be
 * HTTPS and have no trailing slash. It is the API's Render web service; change it here if the service is
 * renamed or moved behind a custom domain.
 */

const DEV_API_HOST: string | null = 'http://192.168.0.105:3000';
const PRODUCTION_API_URL = 'https://bongah.onrender.com';

export const API_BASE_URL = PRODUCTION_API_URL;

/**
 * Base map: OpenStreetMap raster tiles drawn by MapLibre. No account, no API key, no Google.
 *
 * IMPORTANT: tile.openstreetmap.org is a shared community server. Its usage policy
 * (operations.osmfoundation.org/policies/tiles) allows light use such as development and a small
 * pilot, but NOT a production app's traffic, and it may block an app without warning. Before a
 * public release point MAP_TILE_URL at a tile service you pay for or host yourself (MapTiler,
 * Stadia, Thunderforest, your own server...), keep MAP_ATTRIBUTION accurate for that service, and
 * put any key the service needs inside the URL. Nothing else in the app has to change.
 */
export const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** Highest zoom the tile service serves (OpenStreetMap: 19). */
export const MAP_TILE_MAX_ZOOM = 19;
/** Shown on every map. Required by OpenStreetMap's licence (ODbL). */
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors';
/** Where the credit leads when it is tapped. */
export const MAP_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/**
 * Turns a spot on the map into a place name (province, district, neighbourhood, street): OpenStreetMap's Nominatim.
 * No account and no key, like the tiles, and with the same catch: nominatim.openstreetmap.org is a shared server
 * whose usage policy (operations.osmfoundation.org/policies/nominatim) asks for at most one request a second,
 * an identifying User-Agent and no heavy use. That fits a person placing one pin per listing, not a public
 * launch. Before release point this at a geocoder you host or pay for; the answer's shape is the Nominatim one.
 */
export const GEOCODER_URL = 'https://nominatim.openstreetmap.org/reverse';
/** The same service, asked the other way round: a name or landmark in, places with coordinates out (the map's search bar). */
export const GEOCODER_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const GEOCODER_USER_AGENT = 'Bongah/1.0 (real-estate app, Afghanistan)';
/** The place lookup is a convenience: after this long the person types the address themselves. */
export const GEOCODER_TIMEOUT_MS = 8_000;
/** The shared geocoder asks for about one request a second: this long between two questions about the same thing. */
export const GEOCODER_GAP_MS = 1_100;

/**
 * Suggestions while typing a place, when the Bongah API cannot ask Google / Mapbox (no key on the server, the person
 * is not signed in, or the server is down): Photon, komoot's OpenStreetMap search, which is built for search-as-you-type.
 * (Nominatim's usage policy forbids that, so it is only asked once the typing has stopped; see GeocodingService.) A
 * shared, fair-use server like the others: point it at your own instance before a public launch.
 */
export const PHOTON_URL = 'https://photon.komoot.io/api/';
/**
 * Driving routes when the API cannot give one: the public OSRM demo server on OpenStreetMap roads. Light use only
 * (one route per trip, and again only when the driver leaves it); host OSRM or use a paid router before launch.
 */
export const OSRM_ROUTE_URL =
  'https://router.project-osrm.org/route/v1/driving';

/** Give up on a request after this long (slow mobile networks are expected, hanging forever is not). */
export const REQUEST_TIMEOUT_MS = 20_000;

/** How often the checkout screen asks the server whether a payment has gone through. */
export const PAYMENT_POLL_INTERVAL_MS = 3_000;
/** Stop polling after this long; the user can still re-check by hand. */
export const PAYMENT_POLL_TIMEOUT_MS = 10 * 60_000;

/** Uploading a picture can take a while on a slow mobile network. */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** How long "typing…" stays on screen without a newer signal from the other person. */
export const TYPING_VISIBLE_MS = 5_000;
/** How long after the last keystroke we tell the other person we stopped typing. */
export const TYPING_IDLE_MS = 2_500;
/** A socket send gets this long to be acknowledged before the same message is sent over HTTP instead. */
export const SOCKET_ACK_TIMEOUT_MS = 8_000;
