import { createPropertySchema, type CreatePropertyInput } from '@bongah/validation';
import { AFGHANISTAN_BOUNDS } from '@bongah/shared-types';
import { hasRoomsFor, labelsNow } from '../labels';
import { formatMoney, formatNumber, parseLooseNumber, toAsciiDigits } from '../format';
import { activeLanguage, tNow } from '@/i18n/active';
import type { Language } from '@/i18n/config';
import type { DraftRow } from './types';

export type DraftField =
  | 'title'
  | 'description'
  | 'type'
  | 'deal_type'
  | 'price'
  | 'currency'
  | 'area_sqm'
  | 'bedrooms'
  | 'bathrooms'
  | 'province'
  | 'district'
  | 'neighborhood'
  | 'address'
  | 'location'
  | 'images';

export type DraftErrors = Partial<Record<DraftField, string>>;

export interface DraftCheck {
  ok: boolean;
  errors: DraftErrors;
  /** The body to send to the API; present exactly when `ok`. */
  input?: CreatePropertyInput;
}

/** When the description is left empty, the facts of the listing, as a sentence. (The API requires a description.) */
export function autoDescription(row: DraftRow): string {
  const labels = labelsNow();
  const type = row.type ? labels.type[row.type] : tNow('title.property');
  const deal = row.deal_type ? labels.deal[row.deal_type] : '';
  const parts = [`${type}${deal ? ` ${deal}` : ''}`];
  const area = parseLooseNumber(row.area_sqm);
  if (area) parts.push(tNow('desc.area', { n: formatNumber(area) }));
  const rooms = parseLooseNumber(row.bedrooms);
  if (rooms && row.type && hasRoomsFor(row.type)) parts.push(tNow('title.rooms', { n: formatNumber(rooms) }));
  const baths = parseLooseNumber(row.bathrooms);
  if (baths && row.type && hasRoomsFor(row.type)) parts.push(tNow('desc.baths', { n: formatNumber(baths) }));
  const floors = parseLooseNumber(row.floors ?? '');
  if (floors && floors > 1) parts.push(tNow('desc.floors', { n: formatNumber(floors) }));
  let text = parts.join('، ');
  if (row.address.trim()) text += `، ${row.address.trim()}`;
  const price = parseLooseNumber(row.price);
  if (price && row.currency) text += `. ${tNow('desc.price', { price: formatMoney(price, row.currency) })}`;
  return `${text}.`;
}

const cache = new WeakMap<DraftRow, { language: Language; check: DraftCheck }>();

/**
 * Checks a draft the way the API will, with the messages in the language shown, and builds the request body.
 * Cached per row object AND language: after the language is switched the same rows are checked again, so their
 * messages are not left in the old language.
 */
export function checkDraft(row: DraftRow): DraftCheck {
  const language = activeLanguage();
  const hit = cache.get(row);
  if (hit && hit.language === language) return hit.check;
  const check = compute(row);
  cache.set(row, { language, check });
  return check;
}

function compute(row: DraftRow): DraftCheck {
  const errors: DraftErrors = {};
  const title = row.title.replace(/\s+/g, ' ').trim();
  if (title.length < 3) errors.title = tNow('list.col.titleShort');
  else if (title.length > 150) errors.title = tNow('list.col.titleLong');

  const description = row.description.trim() || autoDescription(row);
  if (description.length > 5000) errors.description = tNow('v.description.long');

  if (!row.type) errors.type = tNow('v.type.required');
  if (!row.deal_type) errors.deal_type = tNow('v.deal.required');

  const price = parseLooseNumber(row.price);
  if (price === null || price <= 0) errors.price = tNow('list.col.priceNumber');
  else if (price > 999_999_999_999.99) errors.price = tNow('v.price.big');
  else if (!/^\d+(\.\d{1,2})?$/.test(String(price))) errors.price = tNow('v.price.decimals');
  if (!row.currency) errors.currency = tNow('v.currency.required');

  const area = parseLooseNumber(row.area_sqm);
  if (area === null || area <= 0) errors.area_sqm = tNow('v.area.number');
  else if (area > 100_000_000) errors.area_sqm = tNow('v.area.big');

  const count = (value: string, field: 'bedrooms' | 'bathrooms'): number | undefined => {
    if (!value.trim()) return undefined;
    const n = parseLooseNumber(value);
    if (n === null || !Number.isInteger(n) || n < 0 || n > 50) {
      errors[field] = tNow('v.count');
      return undefined;
    }
    return n;
  };
  const rooms = row.type && !hasRoomsFor(row.type) ? undefined : count(row.bedrooms, 'bedrooms');
  const baths = row.type && !hasRoomsFor(row.type) ? undefined : count(row.bathrooms, 'bathrooms');

  const province = row.province.replace(/\s+/g, ' ').trim();
  if (province.length < 2) errors.province = tNow('v.province.required');
  const place = (v: string, field: 'district' | 'neighborhood') => {
    const t = v.replace(/\s+/g, ' ').trim();
    if (t && t.length < 2) errors[field] = tNow('v.place.short');
    else if (t.length > 80) errors[field] = tNow('v.place.long');
    return t;
  };
  const district = place(row.district, 'district');
  const neighborhood = place(row.neighborhood, 'neighborhood');

  const latText = row.lat.trim();
  const lngText = row.lng.trim();
  let lat: number | undefined;
  let lng: number | undefined;
  if (latText || lngText) {
    const la = parseLatLng(latText);
    const ln = parseLatLng(lngText);
    if (la === null || ln === null) errors.location = tNow('v.location.both');
    else if (la < AFGHANISTAN_BOUNDS.minLat || la > AFGHANISTAN_BOUNDS.maxLat || ln < AFGHANISTAN_BOUNDS.minLng || ln > AFGHANISTAN_BOUNDS.maxLng)
      errors.location = tNow('v.location.outside');
    else {
      lat = la;
      lng = ln;
    }
  }

  const address = row.address.replace(/\s+/g, ' ').trim();
  if (address && address.length < 3) errors.address = tNow('v.address.short');
  else if (address.length > 300) errors.address = tNow('v.address.long');
  else if (!address && lat === undefined && !errors.location) errors.address = tNow('v.address.required');

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const candidate = {
    title,
    description,
    type: row.type,
    deal_type: row.deal_type,
    price,
    currency: row.currency,
    area_sqm: area,
    province,
    ...(row.price_terms ? { price_terms: row.price_terms } : {}),
    ...(rooms !== undefined ? { bedrooms: rooms } : {}),
    ...(baths !== undefined ? { bathrooms: baths } : {}),
    ...(district ? { district } : {}),
    ...(neighborhood ? { neighborhood } : {}),
    ...(address ? { address } : {}),
    ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    ...(row.images.length ? { images: row.images.slice(0, 20) } : {}),
  };
  const parsed = createPropertySchema.safeParse(candidate);
  if (parsed.success) return { ok: true, errors, input: parsed.data };

  // Anything the checks above did not foresee: show the schema's complaint on its field.
  const late: DraftErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? '') as DraftField;
    const known: DraftField[] = ['title', 'description', 'type', 'deal_type', 'price', 'currency', 'area_sqm', 'bedrooms', 'bathrooms', 'province', 'district', 'neighborhood', 'address', 'images'];
    late[known.includes(field) ? field : 'title'] ??= field === 'images' ? tNow('v.images') : tNow('import.publish.invalidValue');
  }
  return { ok: false, errors: late };
}

/** "34.5281", "۳۴٫۵۲۸۱", "34,5281" (one comma = decimal mark when there is nothing else). */
export function parseLatLng(text: string): number | null {
  const t = toAsciiDigits(text).replace(/٫/g, '.').trim();
  if (!/^-?\d{1,3}([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "34.5281, 69.1761" pasted from a map app → the two numbers as text. */
export function splitLatLng(text: string): { lat: string; lng: string } | null {
  const t = toAsciiDigits(text).replace(/٫/g, '.').trim();
  const m = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;،\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  return m ? { lat: m[1]!, lng: m[2]! } : null;
}

