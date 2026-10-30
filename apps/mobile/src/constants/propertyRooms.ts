import type { PropertyType } from '@bongah/shared-types';

/**
 * Kinds of property with no bedrooms or bathrooms to count: land, a garden, a garage, a godam, land with an old building, a shop, an office, a commercial unit and "other".
 * The form does not ask for the counts for them, and every place that shows a listing leaves them out, even for an
 * older listing that has some stored (a shop saved with "۱ اتاق خواب" before this rule).
 */
export const NO_ROOMS: readonly PropertyType[] = [
  'LAND',
  'GARDEN',
  'GARAGE',
  'SHOP',
  'OFFICE',
  'COMMERCIAL',
  'WAREHOUSE',
  'LAND_OLD',
  'OTHER',
];

export const hasRoomsFor = (type: PropertyType): boolean =>
  !NO_ROOMS.includes(type);
