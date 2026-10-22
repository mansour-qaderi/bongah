import { useEffect, useRef, useState } from 'react';
import { locate } from './location';
import { metresBetween, toLngLat, type Coordinate } from './geo';
import { findRoute, type Route } from './routing';
import { useWatchedPosition } from './useLiveLocation';

/** The phone has to be this far from where the route was asked for before it is asked for again. */
const REROUTE_MOVED_M = 150;
/** And a route is never asked for more often than this. */
const REROUTE_EVERY_MS = 20_000;

/**
 * The route from where the phone is to a listing, for the small map on its page. It never shows a permission prompt:
 * if the app was never allowed to know where the phone is there is simply no route (the fullscreen button asks, with
 * its explanations). With a position it asks for the route once, and again when the phone has moved a good way from
 * where the last one started, so the line follows the person without asking the server at every step.
 *
 * `here` is the live position (the first fix, then the moving one); `route` is null until there is one. Nothing runs
 * while `destination` is null.
 */
export function useInlineRoute(destination: Coordinate | null): {
  here: Coordinate | null;
  route: Route | null;
} {
  const [first, setFirst] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const live = useWatchedPosition(first !== null);
  const here = live?.coordinate ?? first;

  const lat = destination?.latitude;
  const lng = destination?.longitude;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    let alive = true;
    locate({ ask: false }).then(found => {
      if (alive && found.status === 'ok') setFirst(found.coordinate);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);

  const askedFrom = useRef<Coordinate | null>(null);
  const askedAt = useRef(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!here || lat === undefined || lng === undefined) return;
    const origin = askedFrom.current;
    if (origin) {
      const moved = metresBetween(toLngLat(origin), toLngLat(here));
      if (moved < REROUTE_MOVED_M || Date.now() - askedAt.current < REROUTE_EVERY_MS)
        return;
    }
    askedFrom.current = here;
    askedAt.current = Date.now();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    findRoute(here, { latitude: lat, longitude: lng }, controller.signal).then(
      found => {
        if (!controller.signal.aborted) setRoute(found);
      },
    );
  }, [here, lat, lng]);

  return { here: destination ? here : null, route: destination ? route : null };
}
