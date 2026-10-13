import type { AgencyMapPin } from '@bongah/shared-types';
import type { Property } from '@bongah/shared-types';
import type { MapPoint } from './cluster';
import { hasPin, type PinnedProperty } from './geo';

export interface PropertyItem extends MapPoint {
  kind: 'property';
  property: PinnedProperty;
}
export interface AgencyItem extends MapPoint {
  kind: 'agency';
  agency: AgencyMapPin;
}
/** Anything the home map can draw. */
export type MapItem = PropertyItem | AgencyItem;

export const propertyKey = (id: string) => `property:${id}`;
export const agencyKey = (id: string) => `agency:${id}`;

/** Listings with an exact pin plus agency offices, as plain points the clustering can group. */
export function buildItems(
  properties: readonly Property[],
  agencies: readonly AgencyMapPin[],
): MapItem[] {
  const items: MapItem[] = [];
  for (const property of properties) {
    if (!hasPin(property)) continue;
    items.push({
      kind: 'property',
      key: propertyKey(property.id),
      lat: property.lat,
      lng: property.lng,
      property,
    });
  }
  for (const agency of agencies) {
    items.push({
      kind: 'agency',
      key: agencyKey(agency.id),
      lat: agency.lat,
      lng: agency.lng,
      agency,
    });
  }
  return items;
}
