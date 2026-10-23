import type { Currency, DealType, PriceTerms, PropertyType } from '@bongah/shared-types';
import { PROVINCES } from '../provinces';
import { addressFrom } from '../address';
import { CURRENCY_LABEL, formatNumber } from '../format';
import { DEAL_LABEL, hasRoomsFor, TYPE_LABEL } from '../labels';
import { cutAt, flatten, isSeparatorLine, stripDecoration, whole, WORD } from './text-utils';
import { emptyDraft, NO_PIN, type DraftRow, type PinnedDefaults } from './types';

export interface ParseOptions {
  /** Fill what the text does not say (province, district, deal, currency). */
  defaults?: PinnedDefaults;
  /** Cut phone numbers out of the description (default true): contact goes through the app. */
  stripPhones?: boolean;
}

// ───────────── Words → numbers ─────────────

const ONES: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12,
  سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100,
};
const NUMBER_WORD = Object.keys(ONES).sort((a, b) => b.length - a.length).join('|');
/** "پنج", "بیست و پنج" */
const WORD_NUMBER = `(?:${NUMBER_WORD})(?:\\s+و\\s+(?:${NUMBER_WORD}))*`;

function wordsToNumber(text: string): number | null {
  const parts = text.split(/\s+و\s+/);
  let sum = 0;
  for (const part of parts) {
    const v = ONES[part.trim()];
    if (v === undefined) return null;
    sum += v;
  }
  return sum;
}

function numberFrom(token: string): number | null {
  const t = token.trim();
  if (/^\d/.test(t)) {
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return wordsToNumber(t);
}

const DIGITS = '\\d+(?:,\\d{3})*(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const ANY_NUMBER = `(?:${DIGITS}|${WORD_NUMBER})`;

// ───────────── Property type & deal ─────────────

/** Type words as written, with the ezafe «ی» they often carry ("ویلای دو طبقه", "خانهٔ" written as "خانه ی"). */
const typeWord = (source: string) => whole(`(?:${source})(?:\\s?ی)?`);

const TYPE_PATTERNS: [PropertyType, RegExp][] = [
  ['APARTMENT', new RegExp(typeWord('آپارتمان|اپارتمان|فلت'), 'u')],
  ['VILLA', new RegExp(typeWord('ویلا|ویلایی'), 'u')],
  ['GARDEN', new RegExp(typeWord('باغ'), 'u')],
  ['SHOP', new RegExp(typeWord('دکان|دوکان|مغازه|دکانچه'), 'u')],
  ['OFFICE', new RegExp(`(?<![${WORD}])(?:دفتر|آفیس|دفتر کار)(?!\\s*(?:املاک|بنگاه|معاملات|ملکی))(?![${WORD}])`, 'u')],
  ['LAND', new RegExp(typeWord('زمین|پلاٹ|پلات'), 'u')],
  ['GARAGE', new RegExp(typeWord('گاراژ'), 'u')],
  ['HOUSE_HAWILI', new RegExp(typeWord('خانه|منزل|حویلی|سرای'), 'u')],
];

/** The earliest property-type word in the text (first line wins when several are there). */
export function detectType(flat: string): PropertyType | null {
  const firstLine = flat.split('\n').find((l) => l.trim()) ?? '';
  for (const scope of [firstLine, flat]) {
    let best: { type: PropertyType; at: number } | null = null;
    for (const [type, re] of TYPE_PATTERNS) {
      const m = re.exec(scope);
      if (m && (!best || m.index < best.at)) best = { type, at: m.index };
    }
    if (best) return best.type;
  }
  return null;
}

const DEAL_PATTERNS: [DealType, RegExp][] = [
  ['RENT', new RegExp(whole('کرایه|کرایی|کرایه‌ای|اجاره|اجاره ای|اجاره‌ای|کرایه ای|کرائی'), 'u')],
  ['MORTGAGE_GROWI', new RegExp(whole('گروی|گرو|رهن|رهنی'), 'u')],
  ['SALE', new RegExp(whole('فروش|فروشی|به فروش|بفروش|برای فروش|می‌فروشم|میفروشم|میفروشیم'), 'u')],
];

export function detectDeal(flat: string): DealType | null {
  let best: { deal: DealType; at: number } | null = null;
  for (const [deal, re] of DEAL_PATTERNS) {
    const m = re.exec(flat);
    if (m && (!best || m.index < best.at)) best = { deal, at: m.index };
  }
  return best?.deal ?? null;
}

// ───────────── Price ─────────────

const UNIT_VALUE: Record<string, number> = {
  هزار: 1e3, لک: 1e5, لکه: 1e5, لکھ: 1e5, میلیون: 1e6, ملیون: 1e6, کرور: 1e7, میلیارد: 1e9, ملیارد: 1e9,
};
const UNIT = Object.keys(UNIT_VALUE).sort((a, b) => b.length - a.length).join('|');
const HALF = '(?:\\s*و\\s*نیم)';
const PRICE_RE = new RegExp(
  `(?<![\\d.,])(?<num>${ANY_NUMBER})(?<half1>${HALF})?(?:\\s*(?<unit>${UNIT})(?![${WORD}]))?(?<half2>${HALF})?`,
  'gu',
);
const CURRENCY_AFTER = /^\s*[:：]?\s*(افغانی|افغانیه|افغانیها|افغانی ها|افغانی‌ها|afn|afs|؋|دالر|دلار|دالری|دالره|usd|\$)/iu;
const CURRENCY_BEFORE = /(\$|usd|دالر|دلار|؋|افغانی)\s*[:：]?\s*$/iu;
const PRICE_KEYWORD = /(قیمت|بها|مبلغ|فی|کرایه|کرایی|اجاره|گروی|گرو|رهن|price|نرخ)\s*[:：]?\s*(?:ماهانه|ماهیانه|سالانه|نهایی|کل)?\s*[:：]?\s*$/iu;
const NOT_PRICE_AFTER = /^\s*(متر|م2|م²|m2|m²|مترمربع|خوابه|اتاق|حمام|تشناب|توالت|منزل|طبقه|سال|کوچه|واحد|باب|جریب|بسوه|فیصد|%|نفر|کیلو|سانتی|ساله|روز|ماه|عدد|دانه|متری)/iu;
const NOT_PRICE_BEFORE = /(ناحیه|کوچه|سرک|پلاک|شماره|واحد|طبقه|بلاک|بلوک|قطعه|ساحه|فاز|ماه|سال|مساحت|متراژ|زیربنا|ابعاد)\s*[:：]?\s*$/u;

const PHONE_RE = /(?<![\d])(?:\+93|0093|93|0)[\s-]?7\d(?:[\s-]?\d){7}(?![\d])/g;

/** Where phone numbers sit in a (digit-normalized) text. */
function phoneSpans(flat: string): [number, number][] {
  return [...flat.matchAll(PHONE_RE)].map((m) => [m.index!, m.index! + m[0].length]);
}

export interface PriceResult {
  value: number;
  currency: Currency | null;
  unit: string | null;
  candidates: number;
  assumedKarur: boolean;
}

export function findPrice(flat: string): PriceResult | null {
  const phones = phoneSpans(flat);
  type Cand = PriceResult & { score: number; at: number };
  const found: Cand[] = [];
  for (const m of flat.matchAll(PRICE_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (phones.some(([a, b]) => start < b && end > a)) continue;
    const g = m.groups!;
    const base = numberFrom(g.num!);
    if (base === null) continue;
    const unit = g.unit ?? null;
    // A bare word-number with nothing after it ("سه") is just a word.
    if (!/^\d/.test(g.num!) && !unit) continue;
    const before = flat.slice(Math.max(0, start - 24), start);
    const after = flat.slice(end, end + 24);
    if (!unit && NOT_PRICE_AFTER.test(after)) continue;
    if (unit && NOT_PRICE_AFTER.test(after) && !CURRENCY_AFTER.test(after)) continue;
    const lineBefore = before.slice(before.lastIndexOf('\n') + 1);

    let currency: Currency | null = null;
    const ca = CURRENCY_AFTER.exec(after);
    if (ca) currency = /دالر|دلار|usd|\$/i.test(ca[1]!) ? 'USD' : 'AFGHANI';
    else {
      const cb = CURRENCY_BEFORE.exec(lineBefore);
      if (cb) currency = /دالر|دلار|usd|\$/i.test(cb[1]!) ? 'USD' : 'AFGHANI';
    }
    const keyword = PRICE_KEYWORD.test(lineBefore);
    if (!unit && !currency && !keyword) continue;
    if (!unit && NOT_PRICE_BEFORE.test(lineBefore) && !currency) continue;

    let value = base * (unit ? UNIT_VALUE[unit]! : 1);
    if (g.half1 || g.half2) value += 0.5 * (unit ? UNIT_VALUE[unit]! : 1);
    value = Math.round(value * 100) / 100;
    if (!(value > 0) || value > 999_999_999_999) continue;

    const score = (currency ? 3 : 0) + (unit ? 2 : 0) + (keyword ? 3 : 0) + (value >= 1000 ? 1 : 0);
    found.push({ value, currency, unit, candidates: 0, assumedKarur: unit === 'کرور', score, at: start });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b.score - a.score || a.at - b.at);
  const best = found[0]!;
  return { value: best.value, currency: best.currency, unit: best.unit, candidates: new Set(found.map((f) => f.value)).size, assumedKarur: best.assumedKarur };
}

export function detectPriceTerms(flat: string): PriceTerms | null {
  if (new RegExp(whole('جورآمد|جور آمد|قابل معامله|قابل بحث|قابل مذاکره|قابل چانه'), 'u').test(flat)) return 'NEGOTIABLE';
  if (new RegExp(whole('مقطوع|قیمت نهایی|قیمت قطعی|بدون کم و کسر|بدون چانه'), 'u').test(flat)) return 'FIXED';
  return null;
}

// ───────────── Area, rooms ─────────────

const AREA_UNIT = '(?:متر\\s*مربع|مترمربع|متری\\s*مربع|متر|متری|م2|م²|m2|m²|sqm)';
const AREA_RE = new RegExp(`(?<![\\d.,])(\\d+(?:\\.\\d+)?)\\s*${AREA_UNIT}(?![${WORD}])`, 'giu');
const AREA_LABEL_RE = new RegExp(`(?<![${WORD}])(?:مساحت(?: زمین)?|متراژ|اندازه)\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)(?![\\d.,]|\\s*(?:جریب|بسوه))`, 'giu');
const STREET_BEFORE = /(کوچه|سرک|جاده|خیابان|عرض|پهنا|راه|مسیر|دیوار|ارتفاع)\s*[:：]?\s*(?:ی|به)?\s*$/u;
const BUILT_BEFORE = /(زیربنا|زیر بنا|بنا|ساخته|ساختمان|فضای)\s*[:：]?\s*$/u;
const DIMENSIONS_RE = /(?<![\d.,])(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?![\d.,])/giu;
const JERIB_RE = /(\d+(?:\.\d+)?)\s*(جریب|بسوه|بیسوه|بسوا)/u;

export interface AreaResult {
  value: number | null;
  fromDimensions: boolean;
  jerib: boolean;
}

export function findArea(flat: string): AreaResult {
  const jerib = JERIB_RE.test(flat);
  const labelled = [...flat.matchAll(AREA_LABEL_RE)].map((m) => Number(m[1]));
  const withUnit: { value: number; built: boolean }[] = [];
  for (const m of flat.matchAll(AREA_RE)) {
    const value = Number(m[1]);
    const before = flat.slice(Math.max(0, m.index! - 22), m.index!);
    const lineBefore = before.slice(before.lastIndexOf('\n') + 1);
    if (STREET_BEFORE.test(lineBefore) && value <= 40) continue; // "کوچه ۶ متری" is a road, not the property
    if (value <= 0 || value > 100_000_000) continue;
    withUnit.push({ value, built: BUILT_BEFORE.test(lineBefore) });
  }
  const land = withUnit.filter((c) => !c.built);
  const pick = labelled.find((v) => v > 0) ?? land[0]?.value ?? withUnit[0]?.value ?? null;
  if (pick !== null) return { value: pick, fromDimensions: false, jerib };
  for (const m of flat.matchAll(DIMENSIONS_RE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 2 && b >= 2 && a <= 2000 && b <= 2000) return { value: Math.round(a * b * 100) / 100, fromDimensions: true, jerib };
  }
  return { value: null, fromDimensions: false, jerib };
}

function countBefore(flat: string, nouns: string): number | null {
  const noun = `(?:${nouns})`;
  const re = new RegExp(`(?<![\\d.,])(${ANY_NUMBER})\\s*(?:باب\\s*)?${noun}(?![${WORD}])`, 'giu');
  for (const m of flat.matchAll(re)) {
    const n = numberFrom(m[1]!);
    if (n !== null && Number.isInteger(n) && n >= 0 && n <= 50) return n;
  }
  const label = new RegExp(`(?<![${WORD}])(?:تعداد\\s*)?${noun}\\s*[:：]\\s*(\\d{1,2})(?![\\d.,])`, 'iu').exec(flat);
  if (label) {
    const n = Number(label[1]);
    if (n >= 0 && n <= 50) return n;
  }
  return null;
}

export const findBedrooms = (flat: string) => countBefore(flat, 'اتاق خواب|اتاقه|اتاق|خوابه|خواب');
export const findBathrooms = (flat: string) => countBefore(flat, 'حمام|تشناب|توالت|دستشویی|بیت الخلا');

// ───────────── Place ─────────────

const PROVINCE_ALIASES: Record<string, string> = {
  قندوز: 'کندز',
  کندهار: 'قندهار',
  'مزار': 'بلخ',
  'مزار شریف': 'بلخ',
  'جلال آباد': 'ننگرهار',
  جلالآباد: 'ننگرهار',
  'پکتیا گردیز': 'پکتیا',
  گردیز: 'پکتیا',
};

const PROVINCE_ENTRIES: { needle: string; province: string }[] = [
  ...PROVINCES.flatMap((p) => [
    { needle: p.name, province: p.name },
    ...(p.capital ? [{ needle: p.capital, province: p.name }] : []),
  ]),
  ...Object.entries(PROVINCE_ALIASES).map(([needle, province]) => ({ needle, province })),
].map((e) => ({ needle: flatten(e.needle), province: e.province }));

const PROVINCE_REGEXES = PROVINCE_ENTRIES.map((e) => ({
  province: e.province,
  re: new RegExp(whole(e.needle.trim().split(/\s+/).join('[\\s\\u200c]*')), 'u'),
}));

/** The earliest province (or provincial capital) named in the text. */
export function findProvince(flat: string): string | null {
  let best: { province: string; at: number } | null = null;
  for (const { re, province } of PROVINCE_REGEXES) {
    const m = re.exec(flat);
    if (m && (!best || m.index < best.at)) best = { province, at: m.index };
  }
  return best?.province ?? null;
}

const PERSIAN_DIGIT = '۰۱۲۳۴۵۶۷۸۹';
const toPersianDigits = (s: string) => s.replace(/\d/g, (d) => PERSIAN_DIGIT[Number(d)]!);

export function findDistrict(flat: string): string | null {
  const m = new RegExp(`(?<![${WORD}])ناحیه\\s*(?:شماره\\s*)?(\\d{1,2}|${WORD_NUMBER})(?![\\d])`, 'u').exec(flat);
  if (!m) return null;
  const n = numberFrom(m[1]!);
  return n === null ? null : `ناحیه ${toPersianDigits(String(n))}`;
}

const LOCALITY_STOP = new Set(['فروشی', 'فروش', 'برای', 'دارای', 'با', 'و', 'در', 'است', 'که', 'قیمت', 'مساحت', 'کرایی', 'کرایه', 'گروی', 'تماس', 'شماره', 'آدرس', 'موقعیت', 'مناسب', 'ناحیه', 'نزدیک', 'پهلوی', 'خانه', 'منزل', 'حویلی', 'زمین', 'آپارتمان', 'دکان', 'ویلا', 'باغ', 'دفتر', 'متر']);
const LOCALITY_RE = new RegExp(`(?<![${WORD}])(?:کارته|شهرک|قلعه|مکروریان|چهارراهی|پروژه|گذر|ساحه|منطقه|تپه|دشت|ده)\\s+[${WORD}]+(?:\\s+[${WORD}]+){0,2}`, 'gu');

export function findNeighborhood(flat: string): string | null {
  for (const m of flat.matchAll(LOCALITY_RE)) {
    const words = m[0].split(/\s+/);
    // "ده هزار" / "ده میلیون" / "ده ۵" is a number, not the village «ده».
    if (words[0] === 'ده' && (words[1] === undefined || /^\d/.test(words[1]) || words[1] in UNIT_VALUE || words[1] in ONES)) continue;
    const kept = [words[0]!];
    for (const w of words.slice(1)) {
      if (LOCALITY_STOP.has(w) || /^\d/.test(w)) break;
      kept.push(w);
    }
    if (kept.length >= 2) return kept.join(' ');
  }
  return null;
}

const ADDRESS_LABEL_RE = /(?:^|\n)\s*[^\n\p{L}]*(?:آدرس|ادرس|نشانی|موقعیت|محل|موقعیت ملک|آدرس ملک)\s*[:：]\s*([^\n]+)/u;

export function findAddress(flat: string): string | null {
  const m = ADDRESS_LABEL_RE.exec(flat);
  if (!m) return null;
  const text = toPersianDigits(stripDecoration(m[1]!)).replace(/,/g, '،');
  return text.length >= 3 ? cutAt(text, 300) : null;
}

// ───────────── Pieces of the text ─────────────

const IMAGE_RE = /https?:\/\/[^\s)>\]"']+\.(?:jpe?g|png|webp)(?:\?[^\s)>\]"']*)?/giu;
const CONTACT_LABEL_LINE = /^[^\p{L}\p{N}]*(?:شماره\s*)?(?:تماس|تلفن|موبایل|واتساپ|واتس اپ|وتساپ|whatsapp|contact|call)[^\p{L}\p{N}]*$/iu;

/** Digit-normalised copy of the same length, so positions found in it are positions in the original. */
function asciiSameLength(text: string): string {
  return text.replace(/[۰-۹]/g, (c) => String(PERSIAN_DIGIT.indexOf(c))).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

export function stripPhoneNumbers(text: string): { text: string; removed: number } {
  const ascii = asciiSameLength(text);
  const spans = phoneSpans(ascii);
  if (spans.length === 0) return { text, removed: 0 };
  let out = '';
  let last = 0;
  for (const [a, b] of spans) {
    out += text.slice(last, a);
    last = b;
  }
  out += text.slice(last);
  const lines = out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s+([،,.:：])/g, '$1').trim())
    .filter((l) => !CONTACT_LABEL_LINE.test(l));
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed: spans.length };
}

function titleLine(raw: string): string | null {
  for (const rawLine of raw.split('\n')) {
    const line = stripDecoration(rawLine.replace(IMAGE_RE, ''))
      .replace(/^(?:عنوان|موضوع)\s*[:：]\s*/u, '');
    if (!line) continue;
    if (!/\p{L}/u.test(line)) continue; // only a number or symbols
    const flat = flatten(line);
    const mostlyPhone = phoneSpans(asciiSameLength(line)).length > 0 && flat.replace(/[\d\s+-]/g, '').length < 6;
    if (mostlyPhone) continue;
    if (line.length < 8) return null;
    return cutAt(line, 150);
  }
  return null;
}

export function composeTitle(f: { type?: PropertyType | ''; deal?: DealType | ''; bedrooms?: number | null; area?: number | null; district?: string; province?: string }): string {
  const parts: string[] = [];
  parts.push(f.type ? TYPE_LABEL[f.type].replace(' / حویلی', '') : 'ملک');
  if (f.bedrooms && f.type && hasRoomsFor(f.type)) parts.push(`${formatNumber(f.bedrooms)} خوابه`);
  if (f.area) parts.push(`${formatNumber(f.area)} متری`);
  if (f.deal) parts.push(f.deal === 'SALE' ? 'برای فروش' : f.deal === 'RENT' ? 'برای کرایه' : 'گروی');
  const place = [f.district, f.province].filter(Boolean).join(' ');
  if (place) parts.push(`در ${place}`);
  return cutAt(parts.join(' '), 150);
}

// ───────────── One listing ─────────────

export function parseListing(block: string, options: ParseOptions = {}): DraftRow {
  const defaults = options.defaults ?? NO_PIN;
  const flat = flatten(block);
  const notes: string[] = [];
  const row = emptyDraft('text');

  const type = detectType(flat);
  if (type) row.type = type;
  else notes.push('نوع ملک تشخیص داده نشد؛ انتخاب کنید.');

  const deal = detectDeal(flat);
  if (deal) row.deal_type = deal;
  else if (defaults.deal_type) {
    row.deal_type = defaults.deal_type;
    notes.push(`نوع معامله در متن نبود؛ «${DEAL_LABEL[defaults.deal_type]}» (پیش‌فرض شما) گذاشته شد.`);
  } else {
    row.deal_type = 'SALE';
    notes.push('نوع معامله در متن نبود؛ «فروشی» گذاشته شد. اگر نیست، عوضش کنید.');
  }

  const price = findPrice(flat);
  if (price) {
    row.price = String(price.value);
    if (price.currency) row.currency = price.currency;
    else {
      const guess: Currency = defaults.currency || 'AFGHANI';
      row.currency = guess;
      notes.push(`ارز نوشته نشده بود؛ ${CURRENCY_LABEL[guess]} (${defaults.currency ? 'پیش‌فرض شما' : 'فرض'}) گذاشته شد.`);
    }
    if (price.assumedKarur) notes.push('«کرور» برابر ۱۰ میلیون حساب شد؛ قیمت را یک بار ببینید.');
    if (price.candidates > 1) notes.push('چند قیمت در متن بود؛ محتمل‌ترین انتخاب شد.');
  } else {
    notes.push('قیمت پیدا نشد.');
    if (defaults.currency) row.currency = defaults.currency;
  }

  const terms = detectPriceTerms(flat);
  if (terms) row.price_terms = terms;

  const area = findArea(flat);
  if (area.value !== null) {
    row.area_sqm = String(area.value);
    if (area.fromDimensions) notes.push('متراژ از ابعاد (طول × عرض) حساب شد.');
  } else if (area.jerib) {
    notes.push('مساحت به جریب/بسوه نوشته شده؛ به متر مربع تبدیل کنید.');
  } else {
    notes.push('متراژ پیدا نشد.');
  }

  if (row.type === '' || hasRoomsFor(row.type)) {
    const bedrooms = findBedrooms(flat);
    if (bedrooms !== null) row.bedrooms = String(bedrooms);
    const bathrooms = findBathrooms(flat);
    if (bathrooms !== null) row.bathrooms = String(bathrooms);
  }

  const province = findProvince(flat);
  row.province = province ?? defaults.province;
  if (!province && defaults.province) notes.push(`ولایت در متن نبود؛ «${defaults.province}» (ثابت‌شده) گذاشته شد.`);
  if (!row.province) notes.push('ولایت تشخیص داده نشد.');

  const district = findDistrict(flat);
  row.district = district ?? defaults.district;
  const neighborhood = findNeighborhood(flat);
  if (neighborhood) row.neighborhood = neighborhood;

  const written = findAddress(flat);
  if (written) row.address = written;
  else {
    row.address = addressFrom({ province: row.province, district: row.district, neighborhood: row.neighborhood, street: '' });
    if (row.address && row.address !== row.province) notes.push('آدرس از ولایت، ناحیه و محله ساخته شد؛ اگر لازم است کامل‌تر کنید.');
    else if (!row.address) notes.push('آدرس پیدا نشد.');
  }
  if (written && row.province && !written.includes(row.province)) {
    row.address = addressFrom({ province: row.province, district: '', neighborhood: '', street: written });
  }

  row.images = [...new Set(block.match(IMAGE_RE) ?? [])].slice(0, 20);

  let description = block.replace(IMAGE_RE, '').replace(/\r\n?/g, '\n');
  description = description
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (options.stripPhones !== false) {
    const stripped = stripPhoneNumbers(description);
    description = stripped.text;
    if (stripped.removed > 0) notes.push('شماره تلفن از توضیحات برداشته شد (مشتری از طریق دکمهٔ تماس اپلیکیشن شماره را می‌بیند).');
  }

  const title = titleLine(description) ?? composeTitle({
    type: row.type,
    deal: row.deal_type,
    bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
    area: row.area_sqm ? Number(row.area_sqm) : null,
    district: row.district,
    province: row.province,
  });
  row.title = title;
  row.description = cutAt(description || title, 5000);
  row.notes = notes;
  return row;
}

// ───────────── Many listings in one paste ─────────────

const FIRST_LINE_SIGNAL = (flatFirstLine: string) => detectType(flatFirstLine) !== null || detectDeal(flatFirstLine) !== null;

function firstContentLine(block: string): string {
  return flatten(block.split('\n').map(stripDecoration).find((l) => l.length > 0) ?? '');
}

/** Cuts a paste into one text per listing. */
export function splitListings(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  if (lines.some(isSeparatorLine)) {
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      if (isSeparatorLine(line)) {
        if (current.join('').trim()) blocks.push(current.join('\n').trim());
        current = [];
      } else current.push(line);
    }
    if (current.join('').trim()) blocks.push(current.join('\n').trim());
    return blocks;
  }

  // Blank lines separate listings, but a block that does not start like a listing is the previous one's continuation
  // (the "price" paragraph, the "contact" paragraph…).
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const merged: string[] = [];
  for (const p of paragraphs) {
    if (merged.length === 0 || FIRST_LINE_SIGNAL(firstContentLine(p))) merged.push(p);
    else merged[merged.length - 1] += `\n${p}`;
  }

  // No blank lines at all: one listing per line when each line carries its own type/deal and price.
  return merged.flatMap((block) => {
    const blockLines = block.split('\n').filter((l) => l.trim());
    if (blockLines.length < 2) return [block];
    const full = blockLines.filter((l) => {
      const f = flatten(l);
      return FIRST_LINE_SIGNAL(f) && findPrice(f) !== null;
    });
    if (full.length < 2) return [block];
    const out: string[] = [];
    for (const l of blockLines) {
      const f = flatten(l);
      if (FIRST_LINE_SIGNAL(f) && findPrice(f) !== null) out.push(l);
      else if (out.length) out[out.length - 1] += `\n${l}`;
      else out.push(l);
    }
    return out;
  });
}

export function parseText(raw: string, options: ParseOptions = {}): DraftRow[] {
  return splitListings(raw).map((block) => parseListing(block, options));
}
