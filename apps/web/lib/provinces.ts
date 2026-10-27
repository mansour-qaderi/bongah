// Generated from apps/mobile/src/constants/provinces.ts (the 34 provinces, Dari names): keep the two in step.
// Names are what listings store (after normalizePlaceName); lat/lng is the provincial capital, used to centre the map.
import type { Language } from '@bongah/shared-types';

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

/** A province's name in the language shown (the stored value is always `name`, in Dari). */
export const provinceLabel = (province: Province, language: Language): string => (language === 'ps' ? province.name_ps : province.name);

/** The same, for a stored province name (a draft's text): unknown names are shown as they are. */
export const provinceNameLabel = (name: string, language: Language): string =>
  language === 'ps' ? (PROVINCES.find((p) => p.name === name)?.name_ps ?? name) : name;
