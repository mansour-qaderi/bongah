import { useEffect, useRef, useState } from 'react';
import type { Language } from '@bongah/shared-types';
import { AREA_MIN_ZOOM, areaKey, areaLabel, nameable, type AreaGuess } from './areaName';
import type { Coordinate } from './geo';
import { describeSpot } from './GeocodingService';
import { nearestProvince } from './geocode';

/** The map must rest this long before the geocoder is asked: a pan or a pinch is not a question. */
export const SETTLE_MS = 800;
/** At least this long between two questions: the server allows 30 a minute and Nominatim one a second. */
export const MIN_GAP_MS = 2_000;
const CACHE_MAX = 200;

/** Spots already named, newest last. Module-level, so the name is there at once when the map comes back. */
const cache = new Map<string, string>();
let lastAskedAt = 0;

const remember = (key: string, label: string) => {
  cache.delete(key);
  cache.set(key, label);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
};

/** For tests: forget what was named and when the geocoder was last asked. */
export function resetAreaNames(): void {
  cache.clear();
  lastAskedAt = 0;
}

export interface AreaView {
  center: Coordinate;
  zoom: number;
}

/**
 * The name of the place the map's middle is on («neighbourhood، district، province»), or null until there is one.
 *
 * Zoomed out (a province or more in view) it is the nearest province, with no network. Zoomed in it asks the same
 * place lookup the listing form uses, once the map has rested, at most one question every couple of seconds, one
 * per ~1 km cell, remembered. While a lookup is on its way the previous name stays (no flicker), and when it fails
 * the province is shown instead.
 */
export function useAreaName(view: AreaView | null, language: Language): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const latest = useRef(0);
  const at: Coordinate | null = view ? view.center : null;
  const atRef = useRef(at);
  atRef.current = at;

  // The effect below runs when the map moves to another ~1 km cell (or changes kind of view), not on every nudge:
  // a lookup already on its way for this cell must not be cancelled by a pixel of drift.
  const key = at ? areaKey(at, language) : null;
  const mode: 'none' | 'province' | 'lookup' =
    !at || !view || !nameable(at) ? 'none' : view.zoom < AREA_MIN_ZOOM ? 'province' : 'lookup';

  useEffect(() => {
    const here = atRef.current;
    if (mode === 'none' || !here || key === null) {
      setLabel(null);
      return undefined;
    }
    if (mode === 'province') {
      setLabel(nearestProvince(here).name[language]);
      return undefined;
    }
    const known = cache.get(key);
    if (known !== undefined) {
      setLabel(known);
      return undefined;
    }

    const ticket = ++latest.current;
    const controller = new AbortController();
    const wait = SETTLE_MS + Math.max(0, lastAskedAt + MIN_GAP_MS - Date.now() - SETTLE_MS);
    const timer = setTimeout(async () => {
      lastAskedAt = Date.now();
      let guess: AreaGuess | null = null;
      try {
        guess = await describeSpot(here, { language, signal: controller.signal });
      } catch {
        guess = null;
      }
      if (controller.signal.aborted || ticket !== latest.current) return;
      const next = areaLabel(guess, here, language);
      remember(key, next);
      setLabel(next);
    }, wait);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, mode, language]);

  return label;
}
