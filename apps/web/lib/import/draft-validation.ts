import { createPropertySchema, type CreatePropertyInput } from '@bongah/validation';
import { AFGHANISTAN_BOUNDS } from '@bongah/shared-types';
import { hasRoomsFor, DEAL_LABEL, TYPE_LABEL } from '../labels';
import { formatMoney, formatNumber, parseLooseNumber, toAsciiDigits } from '../format';
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
  const type = row.type ? TYPE_LABEL[row.type] : 'ملک';
  const deal = row.deal_type ? DEAL_LABEL[row.deal_type] : '';
  const parts = [`${type}${deal ? ` ${deal}` : ''}`];
  const area = parseLooseNumber(row.area_sqm);
  if (area) parts.push(`با مساحت ${formatNumber(area)} متر مربع`);
  const rooms = parseLooseNumber(row.bedrooms);
  if (rooms && row.type && hasRoomsFor(row.type)) parts.push(`${formatNumber(rooms)} خوابه`);
  const baths = parseLooseNumber(row.bathrooms);
  if (baths && row.type && hasRoomsFor(row.type)) parts.push(`${formatNumber(baths)} حمام`);
  let text = parts.join('، ');
  if (row.address.trim()) text += `، ${row.address.trim()}`;
  const price = parseLooseNumber(row.price);
  if (price && row.currency) text += `. قیمت: ${formatMoney(price, row.currency)}`;
  return `${text}.`;
}

const cache = new WeakMap<DraftRow, DraftCheck>();

/** Checks a draft the way the API will, in Persian, and builds the request body. Cached per row object. */
export function checkDraft(row: DraftRow): DraftCheck {
  const hit = cache.get(row);
  if (hit) return hit;
  const result = compute(row);
  cache.set(row, result);
  return result;
}

function compute(row: DraftRow): DraftCheck {
  const errors: DraftErrors = {};
  const title = row.title.replace(/\s+/g, ' ').trim();
  if (title.length < 3) errors.title = 'عنوان دست‌کم ۳ حرف باشد.';
  else if (title.length > 150) errors.title = 'عنوان بیش از ۱۵۰ حرف نباشد.';

  const description = row.description.trim() || autoDescription(row);
  if (description.length > 5000) errors.description = 'توضیحات بیش از ۵۰۰۰ حرف نباشد.';

  if (!row.type) errors.type = 'نوع ملک را انتخاب کنید.';
  if (!row.deal_type) errors.deal_type = 'نوع معامله را انتخاب کنید.';

  const price = parseLooseNumber(row.price);
  if (price === null || price <= 0) errors.price = 'قیمت را به عدد بنویسید.';
  else if (price > 999_999_999_999.99) errors.price = 'قیمت بیش از حد بزرگ است.';
  else if (!/^\d+(\.\d{1,2})?$/.test(String(price))) errors.price = 'قیمت حداکثر دو رقم اعشار دارد.';
  if (!row.currency) errors.currency = 'ارز را انتخاب کنید.';

  const area = parseLooseNumber(row.area_sqm);
  if (area === null || area <= 0) errors.area_sqm = 'متراژ را به عدد بنویسید.';
  else if (area > 100_000_000) errors.area_sqm = 'متراژ بیش از حد بزرگ است.';

  const count = (value: string, field: 'bedrooms' | 'bathrooms'): number | undefined => {
    if (!value.trim()) return undefined;
    const n = parseLooseNumber(value);
    if (n === null || !Number.isInteger(n) || n < 0 || n > 50) {
      errors[field] = 'عدد صحیح بین ۰ و ۵۰.';
      return undefined;
    }
    return n;
  };
  const rooms = row.type && !hasRoomsFor(row.type) ? undefined : count(row.bedrooms, 'bedrooms');
  const baths = row.type && !hasRoomsFor(row.type) ? undefined : count(row.bathrooms, 'bathrooms');

  const province = row.province.replace(/\s+/g, ' ').trim();
  if (province.length < 2) errors.province = 'ولایت لازم است.';
  const place = (v: string, field: 'district' | 'neighborhood') => {
    const t = v.replace(/\s+/g, ' ').trim();
    if (t && t.length < 2) errors[field] = 'دست‌کم ۲ حرف.';
    else if (t.length > 80) errors[field] = 'بیش از ۸۰ حرف نباشد.';
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
    if (la === null || ln === null) errors.location = 'عرض و طول جغرافیایی هر دو را بنویسید (مثلاً ۳۴.۵۲۸۱ و ۶۹.۱۷۶۱).';
    else if (la < AFGHANISTAN_BOUNDS.minLat || la > AFGHANISTAN_BOUNDS.maxLat || ln < AFGHANISTAN_BOUNDS.minLng || ln > AFGHANISTAN_BOUNDS.maxLng)
      errors.location = 'موقعیت بیرون از افغانستان است.';
    else {
      lat = la;
      lng = ln;
    }
  }

  const address = row.address.replace(/\s+/g, ' ').trim();
  if (address && address.length < 3) errors.address = 'دست‌کم ۳ حرف.';
  else if (address.length > 300) errors.address = 'بیش از ۳۰۰ حرف نباشد.';
  else if (!address && lat === undefined && !errors.location) errors.address = 'آدرس بنویسید، یا موقعیت روی نقشه بدهید.';

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
    late[known.includes(field) ? field : 'title'] ??= field === 'images' ? 'نشانی عکس‌ها معتبر نیست.' : 'مقدار معتبر نیست.';
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

