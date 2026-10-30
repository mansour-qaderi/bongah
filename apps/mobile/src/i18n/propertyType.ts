import type { TFunction } from 'i18next';
import type { Market, PropertyType } from '@bongah/shared-types';
import prs from './locales/prs.json';

type Current = keyof typeof prs.propertyType;
type IranType = keyof typeof prs.propertyTypeIR;
type Legacy = keyof typeof prs.propertyTypeLegacy;

const isCurrent = (type: string): type is Current =>
  Object.prototype.hasOwnProperty.call(prs.propertyType, type);
const isLegacy = (type: string): type is Legacy =>
  Object.prototype.hasOwnProperty.call(prs.propertyTypeLegacy, type);

const isIranType = (type: string): type is IranType =>
  Object.prototype.hasOwnProperty.call(prs.propertyTypeIR, type);

/**
 * The name of a property type in the person's language. Every screen words a type through here, so a type is
 * written the same way on the cards, the map, the filter and the form, and a value this build does not know
 * never shows up as a raw key such as "propertyType.OFFICE_SHOP". Three cases:
 * - the nine types of today (خانه, آپارتمان, دکان, دفتر, زمین, باغ, ویلا, گاراج, غیره);
 * - the names an older server or app build may still send (HOUSE, OFFICE_SHOP, GARDEN_VILLA, GARAGE_OTHER), which
 *   read as "خانه", "دکان و دفتر", "باغ و ویلا" and "پارکینگ / گراج / غیره";
 * - anything else (or nothing), which reads as "غیره".
 * Iran words its own six kinds its own way («خانه / ویلایی», «خانه کلنگی», «تجاری و اداری»): pass the market of the
 * listing (or of the list being shown) and those read that way; without one, or for Afghanistan, they read as before.
 */
export function propertyTypeLabel(
  type: string | null | undefined,
  t: TFunction,
  market?: Market,
): string {
  if (market === 'IR' && type && isIranType(type)) return t(`propertyTypeIR.${type}`);
  if (type && isCurrent(type)) return t(`propertyType.${type}`);
  if (type && isLegacy(type)) return t(`propertyTypeLegacy.${type}`);
  return t('propertyType.OTHER');
}

/** What an older name stands for among today's types, where only a picture is needed (an icon on a card or a marker). */
const LEGACY_AS_CURRENT: Record<Legacy, PropertyType> = {
  HOUSE: 'HOUSE_HAWILI',
  OFFICE_SHOP: 'SHOP',
  GARDEN_VILLA: 'GARDEN',
  GARAGE_OTHER: 'GARAGE',
};

/**
 * A type this build knows, for lookups that would otherwise come back empty (the icon for a type): today's types
 * as they are, an older name as the nearest current type, and anything else as OTHER.
 */
export function currentPropertyType(
  type: string | null | undefined,
): PropertyType {
  if (type && isCurrent(type)) return type as PropertyType;
  if (type && isLegacy(type)) return LEGACY_AS_CURRENT[type];
  return 'OTHER';
}
