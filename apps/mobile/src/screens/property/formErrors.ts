import type { TFunction } from 'i18next';
import { ApiError } from '../../api/client';

/** The error text under each field of the listing form, by field. */
export type FieldErrors = Partial<Record<string, string>>;

/**
 * The fields of the listing form, in the order they are on screen. An error is always filed under one of these, so
 * the form can show it under the right field and scroll to the first one.
 */
export const FORM_FIELDS = [
  'address',
  'province',
  'location',
  'title',
  'type',
  'unit',
  'deal_type',
  'price',
  'currency',
  'mortgage_months',
  'price_terms',
  'area_sqm',
  'bedrooms',
  'bathrooms',
  'description',
  'images',
] as const;
export type FormField = (typeof FORM_FIELDS)[number];

/** The label a field has on the form, said in the toast ("قیمت: …"). */
const LABEL_KEYS = {
  title: 'add.titleField',
  type: 'add.type',
  unit: 'add.unit',
  deal_type: 'add.deal',
  price: 'add.price',
  currency: 'add.currency',
  mortgage_months: 'mortgage.label',
  price_terms: 'priceTerms.label',
  area_sqm: 'add.area',
  bedrooms: 'add.bedrooms',
  bathrooms: 'add.bathrooms',
  location: 'add.location',
  province: 'add.province',
  address: 'add.place',
  description: 'add.descriptionLabel',
  images: 'add.images',
} as const satisfies Record<FormField, string>;

/** The form field an API or schema field name belongs to; null for a name the form does not have. */
export function formFieldFor(name: string): FormField | null {
  const head = name.split('.')[0].trim();
  switch (head) {
    // An outline belongs to the same map as the pin.
    case 'lat':
    case 'lng':
    case 'boundary':
      return 'location';
    // The district and neighbourhood have no box of their own: what is wrong with them is wrong with the address.
    case 'district':
    case 'neighborhood':
      return 'address';
    case 'type':
    case 'unit':
    case 'title':
    case 'price':
    case 'currency':
    case 'mortgage_months':
    case 'price_terms':
    case 'bedrooms':
    case 'bathrooms':
    case 'province':
    case 'address':
    case 'description':
    case 'images':
    case 'area_sqm':
    case 'deal_type':
      return head;
    default:
      return null;
  }
}

/** What kind of problem a field has, as far as the person has to know. */
export type Problem =
  | 'required'
  | 'invalid'
  | 'unknown-field'
  | 'unknown-option';

/**
 * The sentence that tells what is wrong with one field. A missing value says it is needed; anything else says what
 * a good value looks like, in the field's own words.
 */
export function fieldMessage(
  field: FormField,
  problem: Problem,
  t: TFunction,
): string {
  if (problem === 'required') {
    if (field === 'location') return t('add.addressRequired');
    return t('add.required');
  }
  if (problem === 'unknown-field') return t('add.error.notSupported');
  if (problem === 'unknown-option') {
    return field === 'type'
      ? t('add.error.typeNotSupported')
      : t('add.error.notSupported');
  }
  switch (field) {
    case 'title':
      return t('add.error.title');
    case 'type':
      return t('add.error.type');
    case 'unit':
      return t('add.error.unit');
    case 'deal_type':
      return t('add.error.deal');
    case 'price':
      return t('add.error.price');
    case 'currency':
      return t('add.error.currency');
    case 'mortgage_months':
      return t('mortgage.error');
    case 'price_terms':
      return t('priceTerms.error');
    case 'area_sqm':
      return t('add.error.area');
    case 'bedrooms':
    case 'bathrooms':
      return t('add.error.rooms');
    case 'location':
      return t('map.outside');
    case 'province':
      return t('add.error.province');
    case 'address':
      return t('add.error.address');
    case 'description':
      return t('add.error.description');
    case 'images':
      return t('add.error.images');
  }
}

/** The English words the server's validation (zod) uses, read back into a kind of problem. */
function problemOf(message: string): Problem {
  if (/^Unrecognized key/i.test(message)) return 'unknown-field';
  if (/^Invalid option/i.test(message)) return 'unknown-option';
  if (/received undefined|^Required$|Required unless/i.test(message))
    return 'required';
  return 'invalid';
}

/**
 * The server refused the listing and said which fields and why (`errors: [{ field, message }]`). This files each
 * one under its field on the form, in words the person can act on. Returns null when the server gave no field
 * detail (then there is nothing to point at, and the caller says what it can).
 */
export function serverFieldErrors(
  error: unknown,
  t: TFunction,
): FieldErrors | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 400 && error.status !== 422) return null;
  const list = error.body.errors;
  if (!Array.isArray(list) || list.length === 0) return null;
  const found: FieldErrors = {};
  for (const entry of list) {
    const message = typeof entry.message === 'string' ? entry.message : '';
    const problem = problemOf(message);
    let name = typeof entry.field === 'string' ? entry.field : '';
    // A field the server does not know is reported on the object, with the key in the message: Unrecognized key: "unit".
    if (!name && problem === 'unknown-field') {
      name = /"([^"]+)"/.exec(message)?.[1] ?? '';
    }
    const field = formFieldFor(name);
    if (!field || found[field]) continue;
    found[field] = fieldMessage(field, problem, t);
  }
  return Object.keys(found).length > 0 ? found : null;
}

/** Fields that have an error, in the order of the form. */
export const failingFields = (errors: FieldErrors): FormField[] =>
  FORM_FIELDS.filter(field => Boolean(errors[field]));

/** A field's label as the toast lists it: without its "(اختیاری)" note. */
const labelOf = (field: FormField, t: TFunction): string =>
  t(LABEL_KEYS[field]).replace(/\s*\([^)]*\)\s*$/, '');

/**
 * The words of the toast, one sentence that names every field that needs the person, so nothing is left to guess:
 * "لطفاً فیلدهای ضروری (عنوان آگهی، مساحت) را تکمیل نمایید." for what is missing, "لطفاً فیلدهای (قیمت) را اصلاح
 * نمایید." for what is filled in wrongly, or both in one sentence. What exactly is wrong with each stays under its own
 * field. (A field is "missing" when its error is the one `fieldMessage` gives for a missing value.)
 */
export function toastForErrors(errors: FieldErrors, t: TFunction): string {
  const fields = failingFields(errors);
  if (fields.length === 0) return '';
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const field of fields) {
    (errors[field] === fieldMessage(field, 'required', t) ? missing : invalid).push(
      labelOf(field, t),
    );
  }
  const list = (names: string[]) => names.join('، ');
  if (missing.length > 0 && invalid.length > 0) {
    return t('add.error.completeAndFix', {
      missing: list(missing),
      invalid: list(invalid),
    });
  }
  return missing.length > 0
    ? t('add.error.completeFields', { fields: list(missing) })
    : t('add.error.fixFields', { fields: list(invalid) });
}
