import { normalizePlaceName } from '@bongah/validation';
import type { Language } from '@bongah/shared-types';

export interface Province {
  id: string;
  /** The Dari name. Its normalised form is what is stored on listings and sent as the `province` filter. */
  name: Record<Language, string>;
  /** Provincial capital, when its name differs from the province's. Shown next to the name. */
  capital?: Record<Language, string>;
  /** Approximate centre, used to move the map when a province is chosen. */
  lat: number;
  lng: number;
}

/**
 * All 34 provinces, with approximate coordinates of the provincial capital. The names and
 * coordinates are written from general knowledge and need a native-speaker / map check
 * before release. Districts are free text in the API, so they are typed, not listed here.
 */
export const PROVINCES: readonly Province[] = [
  { id: 'kabul', name: { prs: 'کابل', ps: 'کابل' }, lat: 34.53, lng: 69.17 },
  { id: 'herat', name: { prs: 'هرات', ps: 'هرات' }, lat: 34.34, lng: 62.2 },
  {
    id: 'balkh',
    name: { prs: 'بلخ', ps: 'بلخ' },
    capital: { prs: 'مزار شریف', ps: 'مزار شریف' },
    lat: 36.71,
    lng: 67.11,
  },
  {
    id: 'kandahar',
    name: { prs: 'قندهار', ps: 'کندهار' },
    lat: 31.62,
    lng: 65.71,
  },
  {
    id: 'nangarhar',
    name: { prs: 'ننگرهار', ps: 'ننګرهار' },
    capital: { prs: 'جلال‌آباد', ps: 'جلال‌اباد' },
    lat: 34.43,
    lng: 70.45,
  },
  { id: 'kunduz', name: { prs: 'کندز', ps: 'کندز' }, lat: 36.73, lng: 68.87 },
  { id: 'ghazni', name: { prs: 'غزنی', ps: 'غزني' }, lat: 33.55, lng: 68.42 },
  {
    id: 'bamyan',
    name: { prs: 'بامیان', ps: 'بامیان' },
    lat: 34.82,
    lng: 67.82,
  },
  {
    id: 'badakhshan',
    name: { prs: 'بدخشان', ps: 'بدخشان' },
    capital: { prs: 'فیض‌آباد', ps: 'فیض‌اباد' },
    lat: 37.12,
    lng: 70.58,
  },
  {
    id: 'takhar',
    name: { prs: 'تخار', ps: 'تخار' },
    capital: { prs: 'تالقان', ps: 'تالقان' },
    lat: 36.73,
    lng: 69.53,
  },
  {
    id: 'baghlan',
    name: { prs: 'بغلان', ps: 'بغلان' },
    capital: { prs: 'پلخمری', ps: 'پلخمري' },
    lat: 35.94,
    lng: 68.71,
  },
  {
    id: 'parwan',
    name: { prs: 'پروان', ps: 'پروان' },
    capital: { prs: 'چاریکار', ps: 'چاریکار' },
    lat: 35.02,
    lng: 69.17,
  },
  {
    id: 'kapisa',
    name: { prs: 'کاپیسا', ps: 'کاپیسا' },
    lat: 35.02,
    lng: 69.34,
  },
  {
    id: 'panjshir',
    name: { prs: 'پنجشیر', ps: 'پنجشېر' },
    lat: 35.31,
    lng: 69.52,
  },
  { id: 'logar', name: { prs: 'لوگر', ps: 'لوګر' }, lat: 33.99, lng: 69.02 },
  { id: 'wardak', name: { prs: 'وردک', ps: 'وردګ' }, lat: 34.4, lng: 68.87 },
  { id: 'paktia', name: { prs: 'پکتیا', ps: 'پکتیا' }, lat: 33.6, lng: 69.23 },
  {
    id: 'paktika',
    name: { prs: 'پکتیکا', ps: 'پکتیکا' },
    lat: 33.17,
    lng: 68.79,
  },
  { id: 'khost', name: { prs: 'خوست', ps: 'خوست' }, lat: 33.34, lng: 69.92 },
  { id: 'laghman', name: { prs: 'لغمان', ps: 'لغمان' }, lat: 34.67, lng: 70.2 },
  { id: 'kunar', name: { prs: 'کنر', ps: 'کنړ' }, lat: 34.87, lng: 71.15 },
  {
    id: 'nuristan',
    name: { prs: 'نورستان', ps: 'نورستان' },
    lat: 35.42,
    lng: 70.92,
  },
  {
    id: 'samangan',
    name: { prs: 'سمنگان', ps: 'سمنګان' },
    capital: { prs: 'ایبک', ps: 'ایبک' },
    lat: 36.26,
    lng: 68.02,
  },
  {
    id: 'sar-e-pol',
    name: { prs: 'سرپل', ps: 'سرپل' },
    lat: 36.22,
    lng: 65.93,
  },
  {
    id: 'jawzjan',
    name: { prs: 'جوزجان', ps: 'جوزجان' },
    capital: { prs: 'شبرغان', ps: 'شبرغان' },
    lat: 36.67,
    lng: 65.75,
  },
  {
    id: 'faryab',
    name: { prs: 'فاریاب', ps: 'فاریاب' },
    capital: { prs: 'میمنه', ps: 'میمنه' },
    lat: 35.92,
    lng: 64.78,
  },
  {
    id: 'badghis',
    name: { prs: 'بادغیس', ps: 'بادغیس' },
    lat: 35.0,
    lng: 63.13,
  },
  { id: 'ghor', name: { prs: 'غور', ps: 'غور' }, lat: 34.52, lng: 65.25 },
  {
    id: 'daykundi',
    name: { prs: 'دایکندی', ps: 'دایکندي' },
    lat: 33.72,
    lng: 66.13,
  },
  {
    id: 'uruzgan',
    name: { prs: 'ارزگان', ps: 'اروزګان' },
    lat: 32.63,
    lng: 65.87,
  },
  { id: 'zabul', name: { prs: 'زابل', ps: 'زابل' }, lat: 32.1, lng: 66.9 },
  {
    id: 'helmand',
    name: { prs: 'هلمند', ps: 'هلمند' },
    capital: { prs: 'لشکرگاه', ps: 'لښکرګاه' },
    lat: 31.59,
    lng: 64.37,
  },
  {
    id: 'nimroz',
    name: { prs: 'نیمروز', ps: 'نیمروز' },
    lat: 31.11,
    lng: 61.89,
  },
  { id: 'farah', name: { prs: 'فراه', ps: 'فراه' }, lat: 32.37, lng: 62.11 },
];

/** Shortcuts shown above the list: the big cities the product launches in. */
export const QUICK_PROVINCE_IDS = [
  'kabul',
  'herat',
  'balkh',
  'kandahar',
  'nangarhar',
] as const;

/** The exact string stored on a listing / sent as `province` for this province. */
export const provinceValue = (province: Province): string =>
  normalizePlaceName(province.name.prs);

/** Finds a province from a stored value, whichever script spelling it was saved with. */
export function findProvince(
  value: string | null | undefined,
): Province | undefined {
  if (!value) return undefined;
  const wanted = normalizePlaceName(value);
  return PROVINCES.find(
    p =>
      normalizePlaceName(p.name.prs) === wanted ||
      normalizePlaceName(p.name.ps) === wanted,
  );
}

/** The province's name in the UI language; unknown (free-text) values are shown as stored. */
export function provinceLabel(value: string, language: Language): string {
  return findProvince(value)?.name[language] ?? value;
}
