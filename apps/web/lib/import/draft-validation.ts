import { createPropertySchema, MAX_MONEY, type CreatePropertyInput } from '@bongah/validation';
import type { Market } from '@bongah/shared-types';
import { hasRoomsFor, labelsNow } from '../labels';
import { formatMoney, formatNumber, parseLooseNumber } from '../format';
import { parseLatLng } from '../coords';
import { activeLanguage, tNow } from '@/i18n/active';
import { activeMarket, draftMismatch, inMarket, marketName, mismatchText } from '../market';
import type { Language } from '@/i18n/config';
import type { DraftRow } from './types';

export type DraftField =
  | 'title'
  | 'description'
  | 'type'
  | 'deal_type'
  | 'price'
  | 'monthly_rent'
  | 'currency'
  | 'features'
  | 'deed_type'
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
  if (row.deal_type === 'MORTGAGE_RENT') {
    const rent = parseLooseNumber(row.monthly_rent ?? '');
    if (price && row.currency) text += `. ${tNow('desc.deposit', { price: formatMoney(price, row.currency) })}`;
    if (rent && row.currency) text += `${price ? '، ' : '. '}${tNow('desc.monthlyRent', { price: formatMoney(rent, row.currency) })}`;
  } else if (price && row.currency) text += `. ${tNow('desc.price', { price: formatMoney(price, row.currency) })}`;
  const tags = (row.features ?? []).map((feature) => labels.feature[feature]);
  if (tags.length) text += `. ${tags.join('، ')}`;
  if (row.deed_type) text += `. ${labels.deed[row.deed_type]}`;
  return `${text}.`;
}

const cache = new WeakMap<DraftRow, { language: Language; market: Market; check: DraftCheck }>();

/** The market a draft is for: its own, else the account's. */
export const marketOfDraft = (row: DraftRow): Market => row.market ?? activeMarket();

/**
 * Checks a draft the way the API will, with the messages in the language shown, and builds the request body.
 * Cached per row object AND language: after the language is switched the same rows are checked again, so their
 * messages are not left in the old language.
 */
export function checkDraft(row: DraftRow): DraftCheck {
  const language = activeLanguage();
  const market = marketOfDraft(row);
  const hit = cache.get(row);
  if (hit && hit.language === language && hit.market === market) return hit.check;
  const check = compute(row, market);
  cache.set(row, { language, market, check });
  return check;
}

function compute(row: DraftRow, market: Market): DraftCheck {
  const errors: DraftErrors = {};
  const title = row.title.replace(/\s+/g, ' ').trim();
  if (title.length < 3) errors.title = tNow('list.col.titleShort');
  else if (title.length > 150) errors.title = tNow('list.col.titleLong');

  const description = row.description.trim() || autoDescription(row);
  if (description.length > 5000) errors.description = tNow('v.description.long');

  if (!row.type) errors.type = tNow('v.type.required');
  if (!row.deal_type) errors.deal_type = tNow('v.deal.required');

  const price = parseLooseNumber(row.price);
  // A mortgage-and-rent (رهن و اجاره) has two amounts: the deposit (the price) and the rent every month.
  const rentDeal = row.deal_type === 'MORTGAGE_RENT';
  let monthlyRent: number | undefined;
  if (rentDeal) {
    const rent = parseLooseNumber(row.monthly_rent ?? '');
    if (!(row.monthly_rent ?? '').trim()) errors.monthly_rent = tNow('v.monthlyRent.required');
    else if (rent === null || rent <= 0) errors.monthly_rent = tNow('list.col.priceNumber');
    else if (rent > MAX_MONEY) errors.monthly_rent = tNow('v.price.big');
    else if (!/^\d+(\.\d{1,2})?$/.test(String(rent))) errors.monthly_rent = tNow('v.price.decimals');
    else monthlyRent = rent;
  }
  if (price === null || price <= 0) errors.price = tNow('list.col.priceNumber');
  else if (price > MAX_MONEY) errors.price = tNow('v.price.big');
  else if (!/^\d+(\.\d{1,2})?$/.test(String(price))) errors.price = tNow('v.price.decimals');
  if (!row.currency) errors.currency = tNow('v.currency.required');

  // The choices that only exist in the other market (a toman price on an Afghan listing, a daily rental of a flat).
  const mismatch = draftMismatch(market, row);
  if (mismatch) errors[mismatch.field] ??= mismatchText(mismatch.reason, market);

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
  // Afghanistan names the province; an Iranian listing does not (the form fills it in from the pin when it can).
  if (market !== 'IR' && province.length < 2) errors.province = tNow('v.province.required');
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
    else if (!inMarket(market, la, ln)) errors.location = tNow('v.location.outside', { market: marketName(market) });
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
    market,
    title,
    description,
    type: row.type,
    deal_type: row.deal_type,
    price,
    ...(monthlyRent !== undefined ? { monthly_rent: monthlyRent } : {}),
    currency: row.currency,
    ...(row.features?.length ? { features: row.features } : {}),
    ...(row.deed_type ? { deed_type: row.deed_type } : {}),
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
    const known: DraftField[] = ['title', 'description', 'type', 'deal_type', 'price', 'monthly_rent', 'currency', 'features', 'deed_type', 'area_sqm', 'bedrooms', 'bathrooms', 'province', 'district', 'neighborhood', 'address', 'images'];
    late[known.includes(field) ? field : 'title'] ??= field === 'images' ? tNow('v.images') : tNow('import.publish.invalidValue');
  }
  return { ok: false, errors: late };
}

export { parseLatLng, splitLatLng } from '../coords';
