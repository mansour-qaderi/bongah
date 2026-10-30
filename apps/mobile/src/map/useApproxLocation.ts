import { useQuery } from '@tanstack/react-query';
import { marketOf, type Property } from '@bongah/shared-types';
import type { Coordinate } from './geo';
import { findAddressLoosely } from './geocode';

type Located = Pick<
  Property,
  'lat' | 'lng' | 'province' | 'district' | 'neighborhood' | 'address' | 'market'
>;

/** What the details page can say about where a listing is on the map. */
export type ApproxLocation =
  | { status: 'pinned'; coordinate: Coordinate }
  /** No pin; the written address is being looked up. */
  | { status: 'finding' }
  /** No pin; the map found the written address (or the town it names). Good for "about here", not for a street. */
  | { status: 'approximate'; coordinate: Coordinate; zoom: number }
  | { status: 'none' };

/**
 * The written place of a listing as one line the map can look up, wide to narrow: the address the owner wrote, then
 * the neighbourhood and district when the address does not already say them. (A listing placed with a pin has no
 * need for it.)
 */
export function writtenPlace(property: Located): string {
  const parts: string[] = [];
  for (const raw of [
    property.address,
    property.neighborhood,
    property.district,
  ]) {
    const part = raw?.trim();
    if (part && !parts.some(have => have.includes(part))) parts.push(part);
  }
  return parts.join('، ');
}

/**
 * Where to put a listing on the map. Its own pin when it has one. Without one the map is asked where the written
 * address is (`findAddressLoosely`, which falls back from the whole address to its town), so a listing posted by
 * typing an address in Zaranj or Qala-e-Fathullah still shows an area instead of "no exact location". The answer
 * is kept for the session: a listing is looked up once, however often the page is opened.
 */
export function useApproxLocation(property: Located): ApproxLocation {
  const pinned = property.lat !== null && property.lng !== null;
  const text = writtenPlace(property);
  const query = useQuery({
    queryKey: ['approx-location', marketOf(property.market), property.province, text],
    queryFn: ({ signal }) =>
      findAddressLoosely(text, property.province, signal, marketOf(property.market)),
    enabled: !pinned && text.length >= 3,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
  if (pinned)
    return {
      status: 'pinned',
      coordinate: { latitude: property.lat!, longitude: property.lng! },
    };
  if (query.isFetching) return { status: 'finding' };
  const result = query.data;
  if (result?.status === 'found') {
    // The whole address was not known when `exact` is false: show the town, not a street-level zoom.
    return {
      status: 'approximate',
      coordinate: result.coordinate,
      zoom: result.exact ? result.zoom : Math.min(result.zoom, 14),
    };
  }
  return { status: 'none' };
}
