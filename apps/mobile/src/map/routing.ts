import type { RouteResult } from '@bongah/shared-types';
import { getAuthToken } from '../api/client';
import { geoRoute } from '../api/endpoints';
import { GEOCODER_USER_AGENT, OSRM_ROUTE_URL } from '../config';
import { metresBetween, type Coordinate, type LngLat } from './geo';

/**
 * Driving directions to a listing, and how far along them the driver is.
 *
 * The route comes from the Bongah API (Google Routes / Mapbox Directions, keys on the server) for a signed-in person,
 * otherwise from the public OSRM server on OpenStreetMap roads, and when neither answers it is a straight line, said
 * as such on screen: the distance is then "as the crow flies" and the arrival time a guess from the current speed.
 */
export type RouteSource = 'google' | 'mapbox' | 'osrm' | 'straight';

export interface Route {
  source: RouteSource;
  /** [longitude, latitude], from the start to the listing. */
  line: LngLat[];
  distanceM: number;
  durationS: number;
  /**
   * A straight line drawn on purpose, not because no road was found: the listing is so close that the roads the map
   * knows would send the driver the long way round (see isDetour).
   */
  near?: boolean;
}

/** Two routes whose times are within this share of each other are "as fast": the more direct of them is taken. */
export const NEAR_TIE = 0.1;

/**
 * The route to drive among the ones a router offered: the fastest and, among those within 10 % of the fastest, the
 * shortest (the same rule the API applies to Google's and Mapbox's answers). A router's first answer is its own idea
 * of "best"; choosing here is what keeps the route to the quickest way there that does not go the long way round.
 */
export function pickRoute(routes: readonly Route[]): Route | null {
  if (routes.length === 0) return null;
  const fastest = Math.min(...routes.map(route => route.durationS));
  return routes
    .filter(route => route.durationS <= fastest * (1 + NEAR_TIE))
    .reduce((best, route) => (route.distanceM < best.distanceM ? route : best));
}

/** A guess for a straight line, when nothing better is known: town driving in Afghanistan. */
export const STRAIGHT_LINE_KMH = 30;

const ROUTE_TIMEOUT_MS = 12_000;

export function straightRoute(from: Coordinate, to: Coordinate): Route {
  const line: LngLat[] = [
    [from.longitude, from.latitude],
    [to.longitude, to.latitude],
  ];
  const distanceM = metresBetween(line[0], line[1]);
  return {
    source: 'straight',
    line,
    distanceM,
    durationS: distanceM / (STRAIGHT_LINE_KMH / 3.6),
  };
}

/** A listing this close (as the crow flies) is judged by the detour rule below, not taken to be a drive. */
export const NEAR_TRIP_M = 300;
/** A road route this many times longer than the straight way, plus the slack, is a detour, not a route. */
export const DETOUR_FACTOR = 2.5;
/** Room for a road that does not run straight (a lane round a block) before a route counts as a detour. */
export const DETOUR_SLACK_M = 150;

/**
 * The drive as the person would count it: the road route, and the stretch from where they stand to the road's first
 * point and from its last point to the listing (a router puts both ends on the nearest road it knows, which in a town
 * whose lanes are only partly mapped can be a few hundred metres away).
 */
export function driveLengthM(route: Route, from: Coordinate, to: Coordinate): number {
  const first = route.line[0];
  const last = route.line[route.line.length - 1];
  return (
    route.distanceM +
    metresBetween([from.longitude, from.latitude], first) +
    metresBetween(last, [to.longitude, to.latitude])
  );
}

/**
 * Whether a road route to a listing that is close by is only the map's gaps talking: for a listing within
 * `NEAR_TRIP_M` of the phone, a drive more than 2.5 times the straight distance (plus 150 m) is not the way anyone
 * goes, so the straight line is shown instead, as such. Further away the router's road route is always kept: a river
 * or a ring road can be a real reason for a long way round.
 */
export function isDetour(route: Route, from: Coordinate, to: Coordinate): boolean {
  if (route.source === 'straight') return false;
  const crow = metresBetween(
    [from.longitude, from.latitude],
    [to.longitude, to.latitude],
  );
  return (
    crow <= NEAR_TRIP_M &&
    driveLengthM(route, from, to) > crow * DETOUR_FACTOR + DETOUR_SLACK_M
  );
}

const usable = (line: unknown): line is LngLat[] =>
  Array.isArray(line) &&
  line.length >= 2 &&
  line.every(
    p =>
      Array.isArray(p) &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );

export function routeFromApi(result: RouteResult): Route | null {
  if (!usable(result.coordinates)) return null;
  return {
    source: result.provider,
    line: result.coordinates,
    distanceM: result.distance_m,
    durationS: result.duration_s,
  };
}

/** OSRM's answer (`geometries=geojson`, alternatives included) as the best Route (see pickRoute), or null when it found none. */
export function routeFromOsrm(body: unknown): Route | null {
  const answer = body as {
    code?: string;
    routes?: { distance?: number; duration?: number; geometry?: { coordinates?: unknown } }[];
  } | null;
  if (answer?.code !== 'Ok') return null;
  const readable: Route[] = [];
  for (const route of answer.routes ?? []) {
    const line = route?.geometry?.coordinates;
    if (
      !route ||
      !usable(line) ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration)
    )
      continue;
    readable.push({
      source: 'osrm',
      line,
      distanceM: route.distance!,
      durationS: route.duration!,
    });
  }
  return pickRoute(readable);
}

async function osrmRoute(
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal,
): Promise<Route | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), ROUTE_TIMEOUT_MS);
  const stop = () => timeout.abort();
  signal?.addEventListener('abort', stop);
  try {
    const url =
      `${OSRM_ROUTE_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      '?overview=full&geometries=geojson&alternatives=true&steps=false';
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: { 'User-Agent': GEOCODER_USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return routeFromOsrm(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** The best route that can be had right now. Never throws: the straight line is the last answer. */
export async function findRoute(
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal,
): Promise<Route> {
  const route = await roadRoute(from, to, signal);
  return isDetour(route, from, to)
    ? { ...straightRoute(from, to), near: true }
    : route;
}

/** What the routers say (the API's, then OSRM), or the straight line when neither answers. */
async function roadRoute(
  from: Coordinate,
  to: Coordinate,
  signal?: AbortSignal,
): Promise<Route> {
  if (getAuthToken() !== null) {
    try {
      const result = await geoRoute(
        {
          from_lat: from.latitude,
          from_lng: from.longitude,
          to_lat: to.latitude,
          to_lng: to.longitude,
        },
        signal,
      );
      const route = routeFromApi(result);
      if (route) return route;
    } catch {
      // 503 (no key), 404 (no road), throttled, offline: OSRM below.
    }
  }
  if (!signal?.aborted) {
    const osrm = await osrmRoute(from, to, signal);
    if (osrm) return osrm;
  }
  return straightRoute(from, to);
}

// ───────────────────────────── progress along the route ─────────────────────────────

export interface RouteProgress {
  /**
   * Metres still to drive: the way along the line from where the driver is attached to it, plus the gap between the
   * driver and the line (and between the line's end and the listing), which the map draws as dashed connectors.
   */
  remainingM: number;
  /** Seconds to arrival. */
  etaS: number;
  /** How far the driver is from the line, in metres. Large means a turn was missed: time for a new route. */
  offRouteM: number;
  /**
   * The point on the line the driver is attached to: the nearest point on the stretch ahead while on the route, and
   * where they last were on it (at first its start) while they are not.
   */
  snapped: LngLat;
  /** Metres along the line from its start to `snapped`. Only ever grows while the driver is on the route. */
  alongM: number;
  /** Within reach of the stretch of line ahead. False: not on the route (yet, or any more). */
  onRoute: boolean;
  /** Close enough to the listing to say "you have arrived". */
  arrived: boolean;
}

/** Inside this distance of the listing the drive is over. */
export const ARRIVED_M = 30;
/** Further than this from the line (and more than the GPS's own error) is off the route. */
export const OFF_ROUTE_M = 60;
/** Moving faster than this, a straight-line guess uses the live speed for the arrival time. */
const MOVING_MPS = 2;
/** How much of the line behind the last place the driver was on it still counts (GPS wander while standing). */
const MATCH_BEHIND_M = 50;
/** How far ahead of the last place the driver was on the line a position may match (a few seconds of driving). */
const MATCH_AHEAD_M = 400;
/** A new route is only asked for once the driver has moved this far from where the last one was asked for. */
export const REROUTE_MIN_MOVE_M = 50;

/**
 * The nearest point to `p` on the segment a–b, as a fraction along it, in a local flat projection (metres east and
 * north of `p`). Accurate to well under a metre over the length of a road segment.
 */
function nearestOnSegment(p: LngLat, a: LngLat, b: LngLat): { t: number; point: LngLat } {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_574;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  return { t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
}

/** The point `along` metres from the start of the line (the line's ends if that is past them). */
function pointAlong(line: LngLat[], cumulative: number[], along: number): LngLat {
  if (along <= 0) return line[0];
  const last = line.length - 1;
  if (along >= cumulative[last]) return line[last];
  let i = 0;
  while (i < last - 1 && cumulative[i + 1] < along) i += 1;
  const span = cumulative[i + 1] - cumulative[i];
  const t = span === 0 ? 0 : (along - cumulative[i]) / span;
  return [
    line[i][0] + (line[i + 1][0] - line[i][0]) * t,
    line[i][1] + (line[i + 1][1] - line[i][1]) * t,
  ];
}

interface RouteProgressOptions {
  /**
   * Metres along the line the driver had got to (0 for a route just found). With it the driver is matched only to the
   * stretch around that place (a little behind, a few hundred metres ahead), so a route that doubles back near where
   * the driver stands is not mistaken for the part of it they are already on: the progress can only move forward,
   * and a driver who has not reached the line yet is told the whole way. Without it the nearest point anywhere on the
   * line is taken.
   */
  matchedAlongM?: number | null;
  /** How far from the line still counts as on it; the GPS's own error allowance. */
  toleranceM?: number;
  /** The listing itself, which a router's last point is only the nearest road to. Arrival and the last stretch use it. */
  destination?: Coordinate;
}

/**
 * Where the driver is along `route` and how much is left. The arrival time follows the route's own estimate
 * (which knows road speeds) scaled to the part still ahead, plus the gap to the line at town pace; for a straight
 * line, which knows nothing about roads, the live speed is used once the car is moving.
 */
export function routeProgress(
  route: Route,
  position: Coordinate,
  speedMps: number | null,
  options: RouteProgressOptions = {},
): RouteProgress {
  const { matchedAlongM = null, toleranceM = OFF_ROUTE_M, destination } = options;
  const p: LngLat = [position.longitude, position.latitude];
  const line = route.line;
  const end = line[line.length - 1];

  const cumulative: number[] = [0];
  for (let i = 1; i < line.length; i++)
    cumulative.push(cumulative[i - 1] + metresBetween(line[i - 1], line[i]));
  const length = cumulative[cumulative.length - 1];

  interface Hit {
    along: number;
    point: LngLat;
    gap: number;
  }
  const hits: Hit[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const hit = nearestOnSegment(p, line[i], line[i + 1]);
    hits.push({
      along: cumulative[i] + hit.t * (cumulative[i + 1] - cumulative[i]),
      point: hit.point,
      gap: metresBetween(p, hit.point),
    });
  }
  const nearest = (candidates: Hit[]): Hit | null =>
    candidates.reduce<Hit | null>(
      (best, hit) => (best === null || hit.gap < best.gap ? hit : best),
      null,
    );

  let attached: Hit;
  let onRoute: boolean;
  if (matchedAlongM === null) {
    attached = nearest(hits) ?? { along: 0, point: line[0], gap: metresBetween(p, line[0]) };
    onRoute = true;
  } else {
    const near = nearest(
      hits.filter(
        hit =>
          hit.along >= matchedAlongM - MATCH_BEHIND_M &&
          hit.along <= matchedAlongM + MATCH_AHEAD_M,
      ),
    );
    if (near && near.gap <= toleranceM) {
      attached = near;
      onRoute = true;
    } else {
      // Not on the stretch ahead: stay attached to where the driver last was on the line (its start, at first).
      const point = pointAlong(line, cumulative, matchedAlongM);
      attached = { along: matchedAlongM, point, gap: metresBetween(p, point) };
      onRoute = false;
    }
  }

  const ahead = Math.max(0, length - attached.along);
  const lastStretch = destination
    ? metresBetween(end, [destination.longitude, destination.latitude])
    : 0;
  const toListing = metresBetween(
    p,
    destination ? [destination.longitude, destination.latitude] : end,
  );
  const remainingM = ahead + attached.gap + lastStretch;
  const arrived = toListing <= ARRIVED_M;

  const pace =
    speedMps !== null && speedMps > MOVING_MPS
      ? speedMps
      : STRAIGHT_LINE_KMH / 3.6;
  let etaS: number;
  if (route.source === 'straight') {
    etaS = remainingM / pace;
  } else {
    const share = route.distanceM > 0 ? Math.min(1, ahead / length || 0) : 0;
    etaS = route.durationS * share + (attached.gap + lastStretch) / (STRAIGHT_LINE_KMH / 3.6);
  }
  return {
    remainingM: arrived ? 0 : remainingM,
    etaS: arrived ? 0 : etaS,
    offRouteM: attached.gap,
    snapped: attached.point,
    alongM: attached.along,
    onRoute,
    arrived,
  };
}

/**
 * Whether to ask for a new route: off the line by more than the GPS error, not asked too recently, and the driver has
 * actually moved since the last one was asked for (`movedM`, from where it was asked). A driver who stands still off
 * the line (the router put the start on a road a block away) would otherwise be given a fresh route every 20 seconds,
 * each one a little different, which is the line that jumps about on the screen.
 */
export function shouldReroute(
  progress: RouteProgress,
  accuracyM: number | null,
  lastRouteAt: number,
  now: number,
  minGapMs = 20_000,
  movedM = Infinity,
): boolean {
  if (progress.arrived) return false;
  return (
    progress.offRouteM > toleranceFor(accuracyM) &&
    now - lastRouteAt >= minGapMs &&
    movedM >= REROUTE_MIN_MOVE_M
  );
}

/** The tolerance a fix's own error asks for: the GPS may be this far from the road while on it. */
export const toleranceFor = (accuracyM: number | null): number =>
  Math.max(OFF_ROUTE_M, (accuracyM ?? 0) * 1.5);
