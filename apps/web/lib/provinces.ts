// Generated from apps/mobile/src/constants/provinces.ts (the 34 provinces, Dari names): keep the two in step.
// Names are what listings store (after normalizePlaceName); lat/lng is the provincial capital, used to centre the map.
export interface Province {
  id: string;
  /** Dari name, as stored on listings. */
  name: string;
  /** Provincial capital when its name differs from the province's (Mazar-i-Sharif for Balkh). */
  capital?: string;
  lat: number;
  lng: number;
}

export const PROVINCES: readonly Province[] = [
  { id: 'kabul', name: 'کابل', lat: 34.53, lng: 69.17 },
  { id: 'herat', name: 'هرات', lat: 34.34, lng: 62.2 },
  { id: 'balkh', name: 'بلخ', capital: 'مزار شریف', lat: 36.71, lng: 67.11 },
  { id: 'kandahar', name: 'قندهار', lat: 31.62, lng: 65.71 },
  { id: 'nangarhar', name: 'ننگرهار', capital: 'جلال‌آباد', lat: 34.43, lng: 70.45 },
  { id: 'kunduz', name: 'کندز', lat: 36.73, lng: 68.87 },
  { id: 'ghazni', name: 'غزنی', lat: 33.55, lng: 68.42 },
  { id: 'bamyan', name: 'بامیان', lat: 34.82, lng: 67.82 },
  { id: 'badakhshan', name: 'بدخشان', capital: 'فیض‌آباد', lat: 37.12, lng: 70.58 },
  { id: 'takhar', name: 'تخار', capital: 'تالقان', lat: 36.73, lng: 69.53 },
  { id: 'baghlan', name: 'بغلان', capital: 'پلخمری', lat: 35.94, lng: 68.71 },
  { id: 'parwan', name: 'پروان', capital: 'چاریکار', lat: 35.02, lng: 69.17 },
  { id: 'kapisa', name: 'کاپیسا', lat: 35.02, lng: 69.34 },
  { id: 'panjshir', name: 'پنجشیر', lat: 35.31, lng: 69.52 },
  { id: 'logar', name: 'لوگر', lat: 33.99, lng: 69.02 },
  { id: 'wardak', name: 'وردک', lat: 34.4, lng: 68.87 },
  { id: 'paktia', name: 'پکتیا', lat: 33.6, lng: 69.23 },
  { id: 'paktika', name: 'پکتیکا', lat: 33.17, lng: 68.79 },
  { id: 'khost', name: 'خوست', lat: 33.34, lng: 69.92 },
  { id: 'laghman', name: 'لغمان', lat: 34.67, lng: 70.2 },
  { id: 'kunar', name: 'کنر', lat: 34.87, lng: 71.15 },
  { id: 'nuristan', name: 'نورستان', lat: 35.42, lng: 70.92 },
  { id: 'samangan', name: 'سمنگان', capital: 'ایبک', lat: 36.26, lng: 68.02 },
  { id: 'sar-e-pol', name: 'سرپل', lat: 36.22, lng: 65.93 },
  { id: 'jawzjan', name: 'جوزجان', capital: 'شبرغان', lat: 36.67, lng: 65.75 },
  { id: 'faryab', name: 'فاریاب', capital: 'میمنه', lat: 35.92, lng: 64.78 },
  { id: 'badghis', name: 'بادغیس', lat: 35.0, lng: 63.13 },
  { id: 'ghor', name: 'غور', lat: 34.52, lng: 65.25 },
  { id: 'daykundi', name: 'دایکندی', lat: 33.72, lng: 66.13 },
  { id: 'uruzgan', name: 'ارزگان', lat: 32.63, lng: 65.87 },
  { id: 'zabul', name: 'زابل', lat: 32.1, lng: 66.9 },
  { id: 'helmand', name: 'هلمند', capital: 'لشکرگاه', lat: 31.59, lng: 64.37 },
  { id: 'nimroz', name: 'نیمروز', lat: 31.11, lng: 61.89 },
  { id: 'farah', name: 'فراه', lat: 32.37, lng: 62.11 },
];
