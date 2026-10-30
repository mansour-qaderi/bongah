import { normalizePlaceName } from '@bongah/validation';
import type { Language, Market } from '@bongah/shared-types';

export interface Province {
  id: string;
  /** The country the province is in. Absent on the Afghan list: Afghanistan. */
  market?: Market;
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

/**
 * Iran's 31 provinces, with the provincial capital's position (for moving the map and for naming a pin when no
 * geocoder can be asked). The Dari spelling is what a listing stores; Pashto readers see the Pashto name where there is
 * one. Written from general knowledge: the Pashto wording needs a native-speaker check, like the Afghan list above.
 */
export const IRAN_PROVINCES: readonly Province[] = [
  {
    id: 'tehran',
    market: 'IR',
    name: { prs: 'تهران', ps: 'تهران' },
    lat: 35.69,
    lng: 51.39,
  },
  {
    id: 'alborz',
    market: 'IR',
    name: { prs: 'البرز', ps: 'البرز' },
    capital: { prs: 'کرج', ps: 'کرج' },
    lat: 35.84,
    lng: 50.94,
  },
  {
    id: 'isfahan',
    market: 'IR',
    name: { prs: 'اصفهان', ps: 'اصفهان' },
    lat: 32.65,
    lng: 51.67,
  },
  {
    id: 'fars',
    market: 'IR',
    name: { prs: 'فارس', ps: 'فارس' },
    capital: { prs: 'شیراز', ps: 'شیراز' },
    lat: 29.59,
    lng: 52.58,
  },
  {
    id: 'khorasan-razavi',
    market: 'IR',
    name: { prs: 'خراسان رضوی', ps: 'خراسان رضوي' },
    capital: { prs: 'مشهد', ps: 'مشهد' },
    lat: 36.3,
    lng: 59.6,
  },
  {
    id: 'east-azerbaijan',
    market: 'IR',
    name: { prs: 'آذربایجان شرقی', ps: 'ختیځ آذربایجان' },
    capital: { prs: 'تبریز', ps: 'تبریز' },
    lat: 38.08,
    lng: 46.29,
  },
  {
    id: 'west-azerbaijan',
    market: 'IR',
    name: { prs: 'آذربایجان غربی', ps: 'لوېدیځ آذربایجان' },
    capital: { prs: 'ارومیه', ps: 'ارومیه' },
    lat: 37.55,
    lng: 45.07,
  },
  {
    id: 'gilan',
    market: 'IR',
    name: { prs: 'گیلان', ps: 'ګیلان' },
    capital: { prs: 'رشت', ps: 'رشت' },
    lat: 37.28,
    lng: 49.58,
  },
  {
    id: 'mazandaran',
    market: 'IR',
    name: { prs: 'مازندران', ps: 'مازندران' },
    capital: { prs: 'ساری', ps: 'ساري' },
    lat: 36.57,
    lng: 53.06,
  },
  {
    id: 'golestan',
    market: 'IR',
    name: { prs: 'گلستان', ps: 'ګلستان' },
    capital: { prs: 'گرگان', ps: 'ګرګان' },
    lat: 36.84,
    lng: 54.43,
  },
  {
    id: 'qom',
    market: 'IR',
    name: { prs: 'قم', ps: 'قم' },
    lat: 34.64,
    lng: 50.88,
  },
  {
    id: 'qazvin',
    market: 'IR',
    name: { prs: 'قزوین', ps: 'قزوین' },
    lat: 36.27,
    lng: 50.0,
  },
  {
    id: 'markazi',
    market: 'IR',
    name: { prs: 'مرکزی', ps: 'مرکزي' },
    capital: { prs: 'اراک', ps: 'اراک' },
    lat: 34.09,
    lng: 49.69,
  },
  {
    id: 'hamadan',
    market: 'IR',
    name: { prs: 'همدان', ps: 'همدان' },
    lat: 34.8,
    lng: 48.51,
  },
  {
    id: 'kermanshah',
    market: 'IR',
    name: { prs: 'کرمانشاه', ps: 'کرمانشاه' },
    lat: 34.31,
    lng: 47.07,
  },
  {
    id: 'kurdistan',
    market: 'IR',
    name: { prs: 'کردستان', ps: 'کردستان' },
    capital: { prs: 'سنندج', ps: 'سنندج' },
    lat: 35.31,
    lng: 46.0,
  },
  {
    id: 'lorestan',
    market: 'IR',
    name: { prs: 'لرستان', ps: 'لرستان' },
    capital: { prs: 'خرم‌آباد', ps: 'خرم‌اباد' },
    lat: 33.49,
    lng: 48.35,
  },
  {
    id: 'ilam',
    market: 'IR',
    name: { prs: 'ایلام', ps: 'ایلام' },
    lat: 33.64,
    lng: 46.42,
  },
  {
    id: 'khuzestan',
    market: 'IR',
    name: { prs: 'خوزستان', ps: 'خوزستان' },
    capital: { prs: 'اهواز', ps: 'اهواز' },
    lat: 31.32,
    lng: 48.67,
  },
  {
    id: 'bushehr',
    market: 'IR',
    name: { prs: 'بوشهر', ps: 'بوشهر' },
    lat: 28.92,
    lng: 50.84,
  },
  {
    id: 'hormozgan',
    market: 'IR',
    name: { prs: 'هرمزگان', ps: 'هرمزګان' },
    capital: { prs: 'بندرعباس', ps: 'بندرعباس' },
    lat: 27.19,
    lng: 56.27,
  },
  {
    id: 'kerman',
    market: 'IR',
    name: { prs: 'کرمان', ps: 'کرمان' },
    lat: 30.28,
    lng: 57.08,
  },
  {
    id: 'sistan-baluchestan',
    market: 'IR',
    name: { prs: 'سیستان و بلوچستان', ps: 'سیستان او بلوچستان' },
    capital: { prs: 'زاهدان', ps: 'زاهدان' },
    lat: 29.5,
    lng: 60.86,
  },
  {
    id: 'yazd',
    market: 'IR',
    name: { prs: 'یزد', ps: 'یزد' },
    lat: 31.9,
    lng: 54.37,
  },
  {
    id: 'semnan',
    market: 'IR',
    name: { prs: 'سمنان', ps: 'سمنان' },
    lat: 35.58,
    lng: 53.39,
  },
  {
    id: 'north-khorasan',
    market: 'IR',
    name: { prs: 'خراسان شمالی', ps: 'شمالي خراسان' },
    capital: { prs: 'بجنورد', ps: 'بجنورد' },
    lat: 37.47,
    lng: 57.33,
  },
  {
    id: 'south-khorasan',
    market: 'IR',
    name: { prs: 'خراسان جنوبی', ps: 'سویلي خراسان' },
    capital: { prs: 'بیرجند', ps: 'بیرجند' },
    lat: 32.87,
    lng: 59.22,
  },
  {
    id: 'ardabil',
    market: 'IR',
    name: { prs: 'اردبیل', ps: 'اردبیل' },
    lat: 38.25,
    lng: 48.3,
  },
  {
    id: 'zanjan',
    market: 'IR',
    name: { prs: 'زنجان', ps: 'زنجان' },
    lat: 36.68,
    lng: 48.5,
  },
  {
    id: 'chaharmahal',
    market: 'IR',
    name: { prs: 'چهارمحال و بختیاری', ps: 'چهارمحال او بختیاري' },
    capital: { prs: 'شهرکرد', ps: 'شهرکرد' },
    lat: 32.33,
    lng: 50.86,
  },
  {
    id: 'kohgiluyeh',
    market: 'IR',
    name: { prs: 'کهگیلویه و بویراحمد', ps: 'کهګیلویه او بویراحمد' },
    capital: { prs: 'یاسوج', ps: 'یاسوج' },
    lat: 30.67,
    lng: 51.59,
  },
];

/** The provinces of a market, in the order the pickers show them. */
export const provincesFor = (market: Market): readonly Province[] =>
  market === 'IR' ? IRAN_PROVINCES : PROVINCES;

/** Every province of both countries: for reading a stored or geocoded name whichever country it is in. */
export const ALL_PROVINCES: readonly Province[] = [
  ...PROVINCES,
  ...IRAN_PROVINCES,
];

/** The country a province is in. */
export const marketOfProvince = (province: Province): Market =>
  province.market ?? 'AF';

/** Shortcuts shown above the list: the big cities each market launches in. */
export const QUICK_PROVINCE_IDS = [
  'kabul',
  'herat',
  'balkh',
  'kandahar',
  'nangarhar',
] as const;
export const QUICK_PROVINCE_IDS_BY_MARKET: Record<Market, readonly string[]> = {
  AF: QUICK_PROVINCE_IDS,
  IR: ['tehran', 'khorasan-razavi', 'isfahan', 'fars', 'alborz'],
};

/** The exact string stored on a listing / sent as `province` for this province. */
export const provinceValue = (province: Province): string =>
  normalizePlaceName(province.name.prs);

/** Finds a province from a stored value, whichever script spelling it was saved with. */
export function findProvince(
  value: string | null | undefined,
): Province | undefined {
  if (!value) return undefined;
  const wanted = normalizePlaceName(value);
  return ALL_PROVINCES.find(
    p =>
      normalizePlaceName(p.name.prs) === wanted ||
      normalizePlaceName(p.name.ps) === wanted,
  );
}

/** The province's name in the UI language; unknown (free-text) values are shown as stored. */
export function provinceLabel(value: string, language: Language): string {
  return findProvince(value)?.name[language] ?? value;
}

/** Words that only say "this is a province": dropped before names are compared. */
const PROVINCE_WORDS =
  /\b(province|wilayat|velayat)\b|ولایت|ولايت|ولایة|ولاية/gi;
const letters = (value: string): string =>
  normalizePlaceName(value)
    .toLowerCase()
    .replace(PROVINCE_WORDS, '')
    .replace(/[^\p{L}]/gu, '');

/**
 * Finds the province a place-name service means by "Kabul Province", "ولایت کابل", "Sar-e Pol" and the like: the
 * Latin id, the Dari name, the Pashto name or the capital's name, ignoring the word "province", spacing and
 * hyphens. Null when nothing fits, so the caller can say "unknown" rather than guess.
 */
export function matchProvince(
  value: string | null | undefined,
): Province | null {
  const wanted = value ? letters(value) : '';
  if (wanted.length < 3) return null;
  const same = (candidate: string | undefined) =>
    candidate !== undefined && letters(candidate) === wanted;
  return (
    ALL_PROVINCES.find(
      p =>
        same(p.id) ||
        same(p.name.prs) ||
        same(p.name.ps) ||
        same(p.capital?.prs) ||
        same(p.capital?.ps),
    ) ?? null
  );
}
