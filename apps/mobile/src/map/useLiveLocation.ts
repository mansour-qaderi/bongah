import { useEffect, useRef, useState } from 'react';
import { LocationManager } from './native';
import { locate } from './location';
import { isInsideSupportedArea, metresBetween, type Coordinate } from './geo';

/** One GPS fix as the navigation screen uses it. */
export interface LiveFix {
  coordinate: Coordinate;
  /** Metres per second, never negative; null until it can be known (the first fix, a phone that reports none). */
  speed: number | null;
  /** Degrees from north the phone is moving towards, when it is moving. */
  heading: number | null;
  /** How sure the fix is, in metres (smaller is better). */
  accuracy: number | null;
  /** Milliseconds since 1970, as the phone stamped it. */
  timestamp: number;
}

export type LiveLocation =
  | { status: 'starting' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'live'; fix: LiveFix };

/** Below this (about 2 km/h) a fix that "moved" is GPS wander, not travel: the speed is shown as 0. */
export const STANDSTILL_MPS = 0.6;
/** A fix this unsure says nothing useful about speed (it can jump 50 m while the car stands still). */
const MAX_ACCURACY_FOR_SPEED_M = 40;

/** What the phone reports as a fix, the shape the Mapbox SDK's location module hands over. */
export interface RawFix {
  coords: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
  };
  timestamp: number;
}

/**
 * Turns the next raw fix into a LiveFix. The speed is the phone's own (from the GPS's Doppler measurement, the most
 * accurate there is) when it gives one; otherwise distance over time since the previous fix. Either way it is
 * smoothed a little (so the HUD does not flicker 41-47-43) and forced to 0 at walking-pace wander.
 */
export function nextFix(previous: LiveFix | null, raw: RawFix): LiveFix {
  const coordinate = {
    latitude: raw.coords.latitude,
    longitude: raw.coords.longitude,
  };
  const accuracy =
    typeof raw.coords.accuracy === 'number' && raw.coords.accuracy >= 0
      ? raw.coords.accuracy
      : null;
  let measured: number | null =
    typeof raw.coords.speed === 'number' &&
    Number.isFinite(raw.coords.speed) &&
    raw.coords.speed >= 0
      ? raw.coords.speed
      : null;
  if (measured === null && previous) {
    const seconds = (raw.timestamp - previous.timestamp) / 1000;
    const trustworthy =
      (accuracy ?? 0) <= MAX_ACCURACY_FOR_SPEED_M &&
      (previous.accuracy ?? 0) <= MAX_ACCURACY_FOR_SPEED_M;
    if (seconds >= 0.5 && seconds <= 30 && trustworthy) {
      measured =
        metresBetween(
          [previous.coordinate.longitude, previous.coordinate.latitude],
          [coordinate.longitude, coordinate.latitude],
        ) / seconds;
    }
  }
  let speed: number | null = measured;
  if (measured !== null && previous?.speed != null) {
    // Exponential smoothing: a sudden real change still shows within two or three fixes.
    speed = previous.speed * 0.35 + measured * 0.65;
  }
  if (speed !== null && speed < STANDSTILL_MPS) speed = 0;
  const heading =
    typeof raw.coords.heading === 'number' &&
    Number.isFinite(raw.coords.heading) &&
    raw.coords.heading >= 0
      ? raw.coords.heading
      : previous?.heading ?? null;
  return { coordinate, speed, heading, accuracy, timestamp: raw.timestamp };
}

/** m/s → km/h, whole numbers (what a speedometer shows). */
export const kmh = (metresPerSecond: number) =>
  Math.round(metresPerSecond * 3.6);

/**
 * Follows the phone's position while `enabled`: asks for permission once (the prompt appears if it was never
 * answered), then streams fixes from the map SDK's location module (the system's LocationManager on Android, Core
 * Location on iOS; no Google services). Stops listening when disabled or unmounted.
 */
export function useLiveLocation(
  enabled: boolean,
  { minDisplacement = 3 }: { minDisplacement?: number } = {},
): LiveLocation {
  const [state, setState] = useState<LiveLocation>({ status: 'starting' });
  const last = useRef<LiveFix | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    last.current = null;
    setState({ status: 'starting' });
    const listener = (raw: RawFix) => {
      if (!alive) return;
      const fix = nextFix(last.current, raw);
      last.current = fix;
      setState({ status: 'live', fix });
    };
    (async () => {
      // One fix through the same path as the map's "my location" button: it asks for permission and says why not.
      const first = await locate({ ask: true });
      if (!alive) return;
      if (first.status === 'denied') {
        setState({ status: 'denied' });
        return;
      }
      if (first.status === 'ok' && last.current === null) {
        listener({ coords: first.coordinate, timestamp: Date.now() });
      } else if (first.status !== 'ok' && last.current === null) {
        // No fix yet (GPS warming up, or outside Afghanistan): keep listening, a fix may still come.
        setState({ status: 'unavailable' });
      }
      try {
        LocationManager.setMinDisplacement(minDisplacement);
        LocationManager.addListener(listener);
      } catch {
        if (alive) setState({ status: 'unavailable' });
      }
    })();
    return () => {
      alive = false;
      try {
        LocationManager.removeListener(listener);
      } catch {
        // already gone
      }
    };
  }, [enabled, minDisplacement]);

  return enabled ? state : { status: 'starting' };
}

/**
 * The phone's position as it moves, for a "you are here" marker that follows the person (Home's map). Unlike
 * `useLiveLocation` it asks for nothing: no permission prompt and no extra position request, so it is only switched on
 * once a first fix has shown that location is allowed. A fix outside Afghanistan is ignored, like everywhere the app
 * shows the phone's position. `null` until a fix arrives and while it is switched off (which also stops the listening:
 * the tab being left or the app going to the background must not keep the GPS awake).
 */
export function useWatchedPosition(
  enabled: boolean,
  { minDisplacement = 5 }: { minDisplacement?: number } = {},
): LiveFix | null {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const last = useRef<LiveFix | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const listener = (raw: RawFix) => {
      const next = nextFix(last.current, raw);
      if (!isInsideSupportedArea(next.coordinate)) return;
      last.current = next;
      setFix(next);
    };
    try {
      LocationManager.setMinDisplacement(minDisplacement);
      LocationManager.addListener(listener);
    } catch {
      // No location module (or it refused): the marker simply stays where the last single fix put it.
    }
    return () => {
      try {
        LocationManager.removeListener(listener);
      } catch {
        // already gone
      }
    };
  }, [enabled, minDisplacement]);

  return enabled ? fix : null;
}
