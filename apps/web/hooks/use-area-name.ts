'use client';

import { useEffect, useRef, useState } from 'react';
import type { Language, PlaceDetails } from '@bongah/shared-types';
import { ApiError, fetcher } from '@/lib/api';
import { AREA_MIN_ZOOM, areaKey, areaLabel, insideAfghanistan } from '@/lib/area-name';
import { nearestProvince, provinceLabel } from '@/lib/provinces';

export interface AreaView {
  lat: number;
  lng: number;
  zoom: number;
}

/** Wait for the map to rest this long before asking where it is (a pan that keeps going asks nothing). */
const SETTLE_MS = 800;
/** After the API says "too many questions" (429), do not ask again for this long; the nearest province stands in. */
const BACKOFF_MS = 60_000;
const CACHE_MAX = 200;

const cache = new Map<string, PlaceDetails | null>();
let blockedUntil = 0;

/**
 * The name of the place the map is looking at, for the small bar at its top.
 *
 * Zoomed out, or while the answer is on its way, or when it cannot be had (offline, outside the geocoder's knowledge, rate
 * limited), the name is the province nearest the centre, which costs nothing and is right almost everywhere. Zoomed in, the
 * API's reverse geocoder (Google/Mapbox when the server has a key, OpenStreetMap otherwise) names the neighbourhood. Answers
 * are kept by kilometre square, so moving about one part of town asks once, and the API's limit (30 a minute) is not a worry.
 */
export function useAreaName(view: AreaView | null, language: Language): string | null {
  const [detail, setDetail] = useState<{ key: string; language: Language; at: { lat: number; lng: number }; details: PlaceDetails | null } | null>(null);
  const asked = useRef(0);

  const wanted = !!view && view.zoom >= AREA_MIN_ZOOM && insideAfghanistan(view.lat, view.lng);
  const key = view && wanted ? areaKey(view.lat, view.lng, language) : null;
  // The question is about the square, not the exact point (every point in it gets the same answer): asked at the
  // square's middle, so a nudge within the square neither restarts the wait nor drops an answer already on its way.
  const cellLat = view ? Number(view.lat.toFixed(2)) : 0;
  const cellLng = view ? Number(view.lng.toFixed(2)) : 0;

  useEffect(() => {
    if (!key || cache.has(key) || Date.now() < blockedUntil) return;
    const run = (asked.current += 1);
    const timer = setTimeout(async () => {
      try {
        const details = await fetcher<PlaceDetails>(`geo/reverse?lat=${cellLat.toFixed(5)}&lng=${cellLng.toFixed(5)}&lang=${language}`);
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(key, details);
        if (asked.current === run) setDetail({ key, language, at: { lat: cellLat, lng: cellLng }, details });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          cache.set(key, null); // nothing known there: remember it, so the same square is not asked again
          if (asked.current === run) setDetail({ key, language, at: { lat: cellLat, lng: cellLng }, details: null });
        } else if (error instanceof ApiError && error.status === 429) {
          blockedUntil = Date.now() + BACKOFF_MS;
        }
        // Any other failure (offline, a bad answer): the province stands in, and the next rest asks again.
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, cellLat, cellLng, language]);

  if (!view) return null;
  const known = key ? cache.get(key) : undefined;
  if (known !== undefined) return areaLabel(known, view, language);
  // The answer for this spot is on its way: keep the last name (a moment off is better than a bar that flickers).
  if (key && detail && detail.language === language) return areaLabel(detail.details, detail.at, language);
  return provinceLabel(nearestProvince(view.lat, view.lng), language);
}
