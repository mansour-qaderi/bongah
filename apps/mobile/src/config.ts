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
 * Base map: Mapbox Streets, vector tiles drawn by the Mapbox Maps SDK (through @rnmapbox/maps). Vector tiles are
 * drawn at the screen's own pixel density, so they are sharp on every phone with no "@2x" files, and they zoom
 * smoothly: past the deepest level stored (16) the map keeps drawing the same shapes larger.
 *
 * The access token is MAPBOX_ACCESS_TOKEN in apps/mobile/.env (or in the environment of the process that starts
 * Metro). A React Native app has no environment of its own, so babel.config.js puts the value into the bundle when
 * it is built; after changing it, restart Metro with `pnpm start --reset-cache`. It must be a PUBLIC token (it starts
 * with "pk."): it ends up inside the app, where anyone can read it. Never put a secret token ("sk.") here. Give the
 * mobile app a token of its own, not the website's: the website's is restricted to its web addresses, which a phone
 * does not send, so it would be refused. Without a token the app still works: the street map falls back to plain
 * OpenStreetMap tiles (below), and the log says so ("[map] MAPBOX_ACCESS_TOKEN is empty in this build").
 *
 * This is a bare React Native app, not an Expo one, so there is no `EXPO_PUBLIC_*` variable: the name is exactly
 * MAPBOX_ACCESS_TOKEN, and it is listed in INLINED in babel.config.js (a name not listed there is never put in the app).
 * Every load error the Mapbox SDK reports is written to the log as "[map] load error / load failed (...)" with its
 * kind, source and the HTTP status it carries, so a refused token (401 / 403) or a dead network can be told apart.
 */
export const MAPBOX_ACCESS_TOKEN: string = (
  process.env.MAPBOX_ACCESS_TOKEN ?? ''
).trim();
/** The street style, as the Mapbox SDK reads it: always Mapbox Streets (`streets-v12`, the bright day style), whatever the phone's own light / dark setting. */
export const MAP_STYLE_URL = 'mapbox://styles/mapbox/streets-v12';
/**
 * The same style over HTTPS. Mapbox Streets writes place names in English first; to put the local (Dari / Pashto)
 * name first the app downloads this once and rewrites its labels (see map/streetStyle.ts).
 */
export const MAP_STYLE_API_URL =
  'https://api.mapbox.com/styles/v1/mapbox/streets-v12';
/**
 * The satellite view: Mapbox Satellite Streets, aerial photographs with the vector street layer drawn over them (road
 * lines and casings, building outlines, place / street / neighbourhood names), so at high zoom, where a photograph alone
 * is a blur of roofs, the roads and names still read. Vector on top means the labels are drawn at the screen's own
 * density, whatever the age or resolution of the photographs under them. Needs the same token as the street map.
 */
export const SATELLITE_STYLE_URL = 'mapbox://styles/mapbox/satellite-streets-v12';
/** The same style over HTTPS, downloaded once so its labels can be put in the local language (map/streetStyle.ts). */
export const SATELLITE_STYLE_API_URL =
  'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12';
/**
 * What the map switches to when Mapbox cannot be used (no token, the token is refused, the service is down): plain
 * OpenStreetMap raster tiles, which need no key either but may be blocked and are meant for light use. (The satellite
 * view has no key-free stand-in: without Mapbox it shows this street map.)
 */
export const MAP_FALLBACK_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** Highest zoom the fallback tiles are asked for (OpenStreetMap: 19). */
export const MAP_FALLBACK_TILE_MAX_ZOOM = 19;
/** How far in the person can zoom. Vector tiles have no picture to run out of; this is street-block detail and more. */
export const MAP_TILE_MAX_ZOOM = 20;

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
export const GEOCODER_USER_AGENT =
  'Bongah/1.2.4 (real-estate app, Afghanistan)';
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
