// Generated from apps/mobile/src/constants/provinces.ts (the 34 provinces, Dari names): keep the two in step.
// Names are what listings store (after normalizePlaceName); lat/lng is the provincial capital, used to centre the map.
import type { Language, Market } from '@bongah/shared-types';

export interface Province {
  id: string;
  /** Dari name, as stored on listings. */
  name: string;
  /** The Pashto spelling, for display only (listings always store the Dari `name`). */
  name_ps: string;
  /** Provincial capital when its name differs from the province's (Mazar-i-Sharif for Balkh). */
  capital?: string;
  capital_ps?: string;
  lat: number;
  lng: number;
}

export const PROVINCES: readonly Province[] = [
  { id: 'kabul', name: 'کابل', name_ps: 'کابل', lat: 34.53, lng: 69.17 },
  { id: 'herat', name: 'هرات', name_ps: 'هرات', lat: 34.34, lng: 62.2 },
  { id: 'balkh', name: 'بلخ', capital: 'مزار شریف', name_ps: 'بلخ', capital_ps: 'مزار شریف', lat: 36.71, lng: 67.11 },
  { id: 'kandahar', name: 'قندهار', name_ps: 'کندهار', lat: 31.62, lng: 65.71 },
  { id: 'nangarhar', name: 'ننگرهار', capital: 'جلال‌آباد', name_ps: 'ننګرهار', capital_ps: 'جلال‌اباد', lat: 34.43, lng: 70.45 },
  { id: 'kunduz', name: 'کندز', name_ps: 'کندز', lat: 36.73, lng: 68.87 },
  { id: 'ghazni', name: 'غزنی', name_ps: 'غزني', lat: 33.55, lng: 68.42 },
  { id: 'bamyan', name: 'بامیان', name_ps: 'بامیان', lat: 34.82, lng: 67.82 },
  { id: 'badakhshan', name: 'بدخشان', capital: 'فیض‌آباد', name_ps: 'بدخشان', capital_ps: 'فیض‌اباد', lat: 37.12, lng: 70.58 },
  { id: 'takhar', name: 'تخار', capital: 'تالقان', name_ps: 'تخار', capital_ps: 'تالقان', lat: 36.73, lng: 69.53 },
  { id: 'baghlan', name: 'بغلان', capital: 'پلخمری', name_ps: 'بغلان', capital_ps: 'پلخمري', lat: 35.94, lng: 68.71 },
  { id: 'parwan', name: 'پروان', capital: 'چاریکار', name_ps: 'پروان', capital_ps: 'چاریکار', lat: 35.02, lng: 69.17 },
  { id: 'kapisa', name: 'کاپیسا', name_ps: 'کاپیسا', lat: 35.02, lng: 69.34 },
  { id: 'panjshir', name: 'پنجشیر', name_ps: 'پنجشېر', lat: 35.31, lng: 69.52 },
  { id: 'logar', name: 'لوگر', name_ps: 'لوګر', lat: 33.99, lng: 69.02 },
  { id: 'wardak', name: 'وردک', name_ps: 'وردګ', lat: 34.4, lng: 68.87 },
  { id: 'paktia', name: 'پکتیا', name_ps: 'پکتیا', lat: 33.6, lng: 69.23 },
  { id: 'paktika', name: 'پکتیکا', name_ps: 'پکتیکا', lat: 33.17, lng: 68.79 },
  { id: 'khost', name: 'خوست', name_ps: 'خوست', lat: 33.34, lng: 69.92 },
  { id: 'laghman', name: 'لغمان', name_ps: 'لغمان', lat: 34.67, lng: 70.2 },
  { id: 'kunar', name: 'کنر', name_ps: 'کنړ', lat: 34.87, lng: 71.15 },
  { id: 'nuristan', name: 'نورستان', name_ps: 'نورستان', lat: 35.42, lng: 70.92 },
  { id: 'samangan', name: 'سمنگان', capital: 'ایبک', name_ps: 'سمنګان', capital_ps: 'ایبک', lat: 36.26, lng: 68.02 },
  { id: 'sar-e-pol', name: 'سرپل', name_ps: 'سرپل', lat: 36.22, lng: 65.93 },
  { id: 'jawzjan', name: 'جوزجان', capital: 'شبرغان', name_ps: 'جوزجان', capital_ps: 'شبرغان', lat: 36.67, lng: 65.75 },
  { id: 'faryab', name: 'فاریاب', capital: 'میمنه', name_ps: 'فاریاب', capital_ps: 'میمنه', lat: 35.92, lng: 64.78 },
  { id: 'badghis', name: 'بادغیس', name_ps: 'بادغیس', lat: 35.0, lng: 63.13 },
  { id: 'ghor', name: 'غور', name_ps: 'غور', lat: 34.52, lng: 65.25 },
  { id: 'daykundi', name: 'دایکندی', name_ps: 'دایکندي', lat: 33.72, lng: 66.13 },
  { id: 'uruzgan', name: 'ارزگان', name_ps: 'اروزګان', lat: 32.63, lng: 65.87 },
  { id: 'zabul', name: 'زابل', name_ps: 'زابل', lat: 32.1, lng: 66.9 },
  { id: 'helmand', name: 'هلمند', capital: 'لشکرگاه', name_ps: 'هلمند', capital_ps: 'لښکرګاه', lat: 31.59, lng: 64.37 },
  { id: 'nimroz', name: 'نیمروز', name_ps: 'نیمروز', lat: 31.11, lng: 61.89 },
  { id: 'farah', name: 'فراه', name_ps: 'فراه', lat: 32.37, lng: 62.11 },
];

/**
 * Iran's 31 provinces (Persian names, which is what a listing stores), with the provincial capital's position for
 * centring the map and for naming a pin when no geocoder can be asked. Pashto readers use the same Persian spelling.
 */
export const IRAN_PROVINCES: readonly Province[] = [
  { id: 'tehran', name: 'تهران', name_ps: 'تهران', lat: 35.69, lng: 51.39 },
  { id: 'alborz', name: 'البرز', capital: 'کرج', name_ps: 'البرز', capital_ps: 'کرج', lat: 35.84, lng: 50.94 },
  { id: 'isfahan', name: 'اصفهان', name_ps: 'اصفهان', lat: 32.65, lng: 51.67 },
  { id: 'fars', name: 'فارس', capital: 'شیراز', name_ps: 'فارس', capital_ps: 'شیراز', lat: 29.59, lng: 52.58 },
  { id: 'khorasan-razavi', name: 'خراسان رضوی', capital: 'مشهد', name_ps: 'خراسان رضوي', capital_ps: 'مشهد', lat: 36.3, lng: 59.6 },
  { id: 'east-azerbaijan', name: 'آذربایجان شرقی', capital: 'تبریز', name_ps: 'ختیځ آذربایجان', capital_ps: 'تبریز', lat: 38.08, lng: 46.29 },
  { id: 'west-azerbaijan', name: 'آذربایجان غربی', capital: 'ارومیه', name_ps: 'لوېدیځ آذربایجان', capital_ps: 'ارومیه', lat: 37.55, lng: 45.07 },
  { id: 'gilan', name: 'گیلان', capital: 'رشت', name_ps: 'ګیلان', capital_ps: 'رشت', lat: 37.28, lng: 49.58 },
  { id: 'mazandaran', name: 'مازندران', capital: 'ساری', name_ps: 'مازندران', capital_ps: 'ساري', lat: 36.57, lng: 53.06 },
  { id: 'golestan', name: 'گلستان', capital: 'گرگان', name_ps: 'ګلستان', capital_ps: 'ګرګان', lat: 36.84, lng: 54.43 },
  { id: 'qom', name: 'قم', name_ps: 'قم', lat: 34.64, lng: 50.88 },
  { id: 'qazvin', name: 'قزوین', name_ps: 'قزوین', lat: 36.27, lng: 50.0 },
  { id: 'markazi', name: 'مرکزی', capital: 'اراک', name_ps: 'مرکزي', capital_ps: 'اراک', lat: 34.09, lng: 49.69 },
  { id: 'hamadan', name: 'همدان', name_ps: 'همدان', lat: 34.8, lng: 48.51 },
  { id: 'kermanshah', name: 'کرمانشاه', name_ps: 'کرمانشاه', lat: 34.31, lng: 47.07 },
  { id: 'kurdistan', name: 'کردستان', capital: 'سنندج', name_ps: 'کردستان', capital_ps: 'سنندج', lat: 35.31, lng: 46.0 },
  { id: 'lorestan', name: 'لرستان', capital: 'خرم‌آباد', name_ps: 'لرستان', capital_ps: 'خرم‌اباد', lat: 33.49, lng: 48.35 },
  { id: 'ilam', name: 'ایلام', name_ps: 'ایلام', lat: 33.64, lng: 46.42 },
  { id: 'khuzestan', name: 'خوزستان', capital: 'اهواز', name_ps: 'خوزستان', capital_ps: 'اهواز', lat: 31.32, lng: 48.67 },
  { id: 'bushehr', name: 'بوشهر', name_ps: 'بوشهر', lat: 28.92, lng: 50.84 },
  { id: 'hormozgan', name: 'هرمزگان', capital: 'بندرعباس', name_ps: 'هرمزګان', capital_ps: 'بندرعباس', lat: 27.19, lng: 56.27 },
  { id: 'kerman', name: 'کرمان', name_ps: 'کرمان', lat: 30.28, lng: 57.08 },
  { id: 'sistan-baluchestan', name: 'سیستان و بلوچستان', capital: 'زاهدان', name_ps: 'سیستان او بلوچستان', capital_ps: 'زاهدان', lat: 29.5, lng: 60.86 },
  { id: 'yazd', name: 'یزد', name_ps: 'یزد', lat: 31.9, lng: 54.37 },
  { id: 'semnan', name: 'سمنان', name_ps: 'سمنان', lat: 35.58, lng: 53.39 },
  { id: 'north-khorasan', name: 'خراسان شمالی', capital: 'بجنورد', name_ps: 'شمالي خراسان', capital_ps: 'بجنورد', lat: 37.47, lng: 57.33 },
  { id: 'south-khorasan', name: 'خراسان جنوبی', capital: 'بیرجند', name_ps: 'سویلي خراسان', capital_ps: 'بیرجند', lat: 32.87, lng: 59.22 },
  { id: 'ardabil', name: 'اردبیل', name_ps: 'اردبیل', lat: 38.25, lng: 48.3 },
  { id: 'zanjan', name: 'زنجان', name_ps: 'زنجان', lat: 36.68, lng: 48.5 },
  { id: 'chaharmahal', name: 'چهارمحال و بختیاری', capital: 'شهرکرد', name_ps: 'چهارمحال او بختیاري', capital_ps: 'شهرکرد', lat: 32.33, lng: 50.86 },
  { id: 'kohgiluyeh', name: 'کهگیلویه و بویراحمد', capital: 'یاسوج', name_ps: 'کهګیلویه او بویراحمد', capital_ps: 'یاسوج', lat: 30.67, lng: 51.59 },
];

/** The provinces of a market, in the order the pickers show them. */
export const provincesFor = (market: Market): readonly Province[] => (market === 'IR' ? IRAN_PROVINCES : PROVINCES);

/** The market a stored province name belongs to, or null for a name neither list knows. */
export function marketOfProvince(name: string): Market | null {
  if (PROVINCES.some((p) => p.name === name)) return 'AF';
  if (IRAN_PROVINCES.some((p) => p.name === name)) return 'IR';
  return null;
}

/** A province's name in the language shown (the stored value is always `name`, in Dari). */
export const provinceLabel = (province: Province, language: Language): string => (language === 'ps' ? province.name_ps : province.name);

/** The same, for a stored province name (a draft's text): unknown names are shown as they are. */
export const provinceNameLabel = (name: string, language: Language): string =>
  language === 'ps' ? ([...PROVINCES, ...IRAN_PROVINCES].find((p) => p.name === name)?.name_ps ?? name) : name;

/** The province whose capital is closest to a point: what to call a place when no geocoder can be asked. Approximate near borders. */
export function nearestProvince(lat: number, lng: number, market?: Market): Province {
  // Without a market, the closest capital of either country: the point itself says which one it is in.
  const list = market ? provincesFor(market) : [...PROVINCES, ...IRAN_PROVINCES];
  // Longitude degrees shrink with latitude; this is plenty accurate for ranking 34 places.
  const scale = Math.cos((lat * Math.PI) / 180);
  let best = list[0]!;
  let bestDistance = Infinity;
  for (const p of list) {
    const dLat = p.lat - lat;
    const dLng = (p.lng - lng) * scale;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best;
}
