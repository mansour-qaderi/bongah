import type { Language } from '@bongah/shared-types';
import type { Province } from '../constants/provinces';
import { isInsideSupportedArea, type Coordinate } from './geo';
import { nearestProvince } from './geocode';

/** Below this zoom the view spans a province or more: the province is the honest name, and no geocoder is asked. */
export const AREA_MIN_ZOOM = 11;

/** One cache slot and one question to the geocoder: about a kilometre, the size of a neighbourhood. */
export const areaKey = (point: Coordinate, language: Language): string =>
  `${point.latitude.toFixed(2)}:${point.longitude.toFixed(2)}:${language}`;

/** What the geocoder said about a spot, as far as it matters for the title. */
export interface AreaGuess {
  province: Province | null;
  district: string;
  neighborhood: string;
  /** False when nothing could describe the spot: `province` is then only the nearest capital's. */
  answered: boolean;
}

/**
 * The line shown over the map: «neighbourhood، district، province» as far as the geocoder knew it, and the province
 * alone when it knew nothing. A district named like its province is not said twice.
 */
export function areaLabel(guess: AreaGuess | null, at: Coordinate, language: Language): string {
  const province = (guess?.province ?? nearestProvince(at)).name[language];
  if (!guess?.answered) return province;
  const parts: string[] = [];
  const neighborhood = guess.neighborhood.trim();
  const district = guess.district.trim();
  if (neighborhood) parts.push(neighborhood);
  if (district && district !== neighborhood) parts.push(district);
  if (parts.length === 0) return province;
  if (parts[parts.length - 1] !== province) parts.push(province);
  return parts.join('، ');
}

/** The map's middle is only named inside the country: out at sea or abroad there is nothing honest to say. */
export const nameable = (point: Coordinate): boolean => isInsideSupportedArea(point);
