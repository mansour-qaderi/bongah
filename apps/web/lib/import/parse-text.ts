import type { Currency, DealType, PriceTerms, PropertyType } from '@bongah/shared-types';
import { normalizeAfghanMobile } from '@bongah/validation';
import { PROVINCES, provinceNameLabel } from '../provinces';
import { addressFrom } from '../address';
import { currencyName, formatNumber } from '../format';
import { hasRoomsFor, labelsFor, labelsNow } from '../labels';
import { activeLanguage, tNow } from '@/i18n/active';
import { translate } from '@/i18n/translate';
import type { Language } from '@/i18n/config';
import { cutAt, flatten, isSeparatorLine, stripDecoration, whole, WORD } from './text-utils';
import { emptyDraft, NO_PIN, type DraftRow, type PinnedDefaults } from './types';

export interface ParseOptions {
  /** Fill what the text does not say (province, district, deal, currency). */
  defaults?: PinnedDefaults;
  /**
   * Tidy the description (default false): cut phone numbers and channel/link footers out of it. Off, the description is
   * the whole pasted text, every number and note in it, so nothing the owner wrote is lost; the first number is still
   * read into the phone column either way.
   */
  stripPhones?: boolean;
  /** Treat the whole paste as ONE listing, however many paragraphs it has (default false: it is cut into listings). */
  single?: boolean;
}

// ───────────── Words → numbers ─────────────

const ONES: Record<string, number> = {
  صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12,
  سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19,
  بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100,
  // Pashto number words (the text is flattened first, so «ي» is already «ی»)
  یو: 1, دوه: 2, درې: 3, څلور: 4, پنځه: 5, شپږ: 6, اوه: 7, اته: 8, لس: 10, یوولس: 11, دولس: 12, دیارلس: 13, څوارلس: 14,
  پنځلس: 15, شپاړس: 16, اوولس: 17, اتلس: 18, نولس: 19, شل: 20, دېرش: 30, څلوېښت: 40, پنځوس: 50, شپېته: 60, اویا: 70, اتیا: 80, سل: 100,
};
const NUMBER_WORD = Object.keys(ONES).sort((a, b) => b.length - a.length).join('|');
/** "پنج", "بیست و پنج" */
const WORD_NUMBER = `(?:${NUMBER_WORD})(?:\\s+(?:و|او)\\s+(?:${NUMBER_WORD}))*`;

function wordsToNumber(text: string): number | null {
  const parts = text.split(/\s+(?:و|او)\s+/);
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
  ['APARTMENT', new RegExp(typeWord('آپارتمان|اپارتمان|آپارتمنت|اپارتمنت|اپارتمانت|فلت|فلټ'), 'u')],
  ['VILLA', new RegExp(typeWord('ویلا|ویلایی'), 'u')],
  ['GARDEN', new RegExp(typeWord('باغ'), 'u')],
  ['SHOP', new RegExp(typeWord('دکان|دوکان|مغازه|دکانچه|دکان تجارتی|مارکیت|مارکت|سرای تجارتی'), 'u')],
  ['OFFICE', new RegExp(`(?<![${WORD}])(?:دفتر|آفیس|دفتر کار)(?!\\s*(?:املاک|بنگاه|معاملات|ملکی))(?![${WORD}])`, 'u')],
  ['LAND', new RegExp(typeWord('زمین|پلاٹ|پلات|پلاټ|ځمکه|ځمکې'), 'u')],
  ['GARAGE', new RegExp(typeWord('گاراژ|ګاراژ|ګراج'), 'u')],
  ['HOUSE_HAWILI', new RegExp(typeWord('خانه|خانه مسکونی|منزل|منزل مسکونی|حویلی|حویلۍ|سرای|کور|هاوس|تاون هاوس'), 'u')],
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
  ['RENT', new RegExp(whole('کرایه|کرایی|کرایې|کرایه‌ای|اجاره|اجاره ای|اجاره‌ای|کرایه ای|کرائی'), 'u')],
  ['MORTGAGE_GROWI', new RegExp(whole('گروی|گرو|گیروی|گیرو|گیرویی|گرویی|گیروئی|گروئی|گرو داده|گیرو داده|رهن|رهنی|ګروی|ګرو'), 'u')],
  ['SALE', new RegExp(whole('فروش|فروشی|به فروش|بفروش|برای فروش|می‌فروشم|میفروشم|میفروشیم|پلور|پلورنه|پلورنې'), 'u')],
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
  هزار: 1e3, زر: 1e3, زره: 1e3, لک: 1e5, لکه: 1e5, لکھ: 1e5, میلیون: 1e6, ملیون: 1e6, کرور: 1e7, میلیارد: 1e9, ملیارد: 1e9,
};
const UNIT = Object.keys(UNIT_VALUE).sort((a, b) => b.length - a.length).join('|');
const HALF = '(?:\\s*و\\s*نیم)';
const PRICE_RE = new RegExp(
  `(?<![\\d.,])(?<num>${ANY_NUMBER})(?<half1>${HALF})?(?:\\s*(?<unit>${UNIT})(?![${WORD}]))?(?<half2>${HALF})?(?:\\s*(?:و|او)\\s*(?<n2>${DIGITS})\\s*(?<u2>${UNIT})(?![${WORD}]))?`,
  'gu',
);
const CURRENCY_AFTER = /^\s*[:：]?\s*(افغانی|افغانیه|افغانیها|افغانی ها|افغانی‌ها|افغانۍ|افغانیو|afn|afs|؋|دالر|دلار|دالری|دالره|ډالر|ډالره|ډالرو|usd|\$)/iu;
const CURRENCY_BEFORE = /(\$|usd|دالر|دلار|ډالر|؋|افغانی|افغانۍ)\s*[:：]?\s*$/iu;
/**
 * What can stand right before a price: «قیمت:», «قیمت فروش:», «قیمت نهایی ماهانه =», «کرایه -», «مبلغ گروی», or a deal word
 * used as the label («فروش: ...»).
 */
const PRICE_WORD = 'قیمت|بها|بیه|بیې|مبلغ|فی|کرایه|کرایی|کرایې|اجاره|گیروی|گیرو|گروی|گرو|ګروی|ګرو|رهن|price|نرخ|پول';
const PRICE_QUALIFIER = 'فروش|فروشی|کرایه|کرایی|اجاره|گروی|رهن|ماهانه|ماهیانه|سالانه|نهایی|قطعی|کل|کلی|تقریبی|پیشنهادی|ملک|خانه|حویلی|آپارتمان|زمین|دکان|پلور|پلورنې|میاشتنۍ|کلنۍ|افغانی|دالر';
const PRICE_KEYWORD = new RegExp(
  `(?<![${WORD}])(?:(?:${PRICE_WORD})(?:\\s+(?:${PRICE_QUALIFIER})){0,2}|(?:فروش|فروشی|پلور|پلورنه)(?=\\s*[:：=]))\\s*(?:[:：=]|[-–—]+|است|می‌باشد|میباشد)?\\s*(?:[:：=]|[-–—]+)?\\s*$`,
  'iu',
);
/** «هر متر ۲۰ هزار»: the price of a metre, not of the property. */
const PER_UNIT_BEFORE = /(?:هر|فی|به ازای هر)\s*(?:متر مربع|متر|جریب|بسوه)\s*(?:[:：=]|[-–—]+)?\s*(?:قیمت|بها)?\s*[:：=]?\s*$/u;
const PER_UNIT_AFTER = /^\s*(?:افغانی|افغانۍ|دالر|دلار|ډالر|\$|؋)?\s*(?:فی|هر|به ازای هر)\s*(?:متر|جریب|بسوه)/iu;
const NOT_PRICE_AFTER = /^\s*(متر|م2|م²|m2|m²|مترمربع|خوابه|اتاق|حمام|تشناب|توالت|منزل|طبقه|سال|کوچه|واحد|باب|جریب|بسوه|فیصد|%|نفر|کیلو|سانتی|ساله|روز|ماه|عدد|دانه|متری|خوب|خونه|خونې|پوړ|کوڅه|کاله|ورځ|میاشت|سلنه)/iu;
const NOT_PRICE_BEFORE = /(کد|کود|ایدی|آی دی|id|ناحیه|کوچه|کوڅه|سرک|پلاک|شماره|واحد|طبقه|پوړ|بلاک|بلوک|قطعه|ساحه|فاز|ماه|سال|میاشت|مساحت|متراژ|زیربنا|ابعاد)\s*[:：]?\s*$/u;

const PHONE_RE = /(?<![\d])\(?(?:\+93|0093|93|0)\)?[\s-]?7\d(?:[\s-]?\d){7}(?![\d])/g;
/** «تماس: 798286200»: nine digits without the 0 or +93, accepted only right after a word that says it is a phone number. */
const CONTACT_WORD = 'شماره|تماس|تلفن|تلیفون|موبایل|واتساپ|واتس اپ|وتساپ|whatsapp|contact|call|اړیکه';
const BARE_PHONE_RE = new RegExp(`(?<![${WORD}])(?:${CONTACT_WORD})[^\\d\\n]{0,12}(7\\d(?:[\\s-]?\\d){7})(?![\\d])`, 'giu');

/** Where phone numbers sit in a (digit-normalized) text, in order. */
function phoneSpans(flat: string): [number, number][] {
  const spans: [number, number][] = [...flat.matchAll(PHONE_RE)].map((m) => [m.index!, m.index! + m[0].length]);
  for (const m of flat.matchAll(BARE_PHONE_RE)) {
    const end = m.index! + m[0].length;
    const span: [number, number] = [end - m[1]!.length, end];
    if (!spans.some(([a, b]) => span[0] < b && span[1] > a)) spans.push(span);
  }
  return spans.sort((x, y) => x[0] - y[0]);
}

/**
 * The phone numbers a text carries, each as +93XXXXXXXXX (any way of writing it: 0798286200, +93 798 286 200,
 * ۰۷۹۸۲۸۶۲۰۰, 0093-798-286-200), in the order written, without repeats.
 */
export function findPhones(text: string): string[] {
  const ascii = asciiSameLength(text);
  const found: string[] = [];
  for (const [a, b] of phoneSpans(ascii)) {
    const phone = normalizeAfghanMobile(ascii.slice(a, b));
    if (phone && !found.includes(phone)) found.push(phone);
  }
  return found;
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
    if (PER_UNIT_AFTER.test(after)) continue;
    const lineBefore = before.slice(before.lastIndexOf('\n') + 1);
    if (PER_UNIT_BEFORE.test(lineBefore)) continue;

    let currency: Currency | null = null;
    const ca = CURRENCY_AFTER.exec(after);
    if (ca) currency = /دالر|دلار|ډالر|usd|\$/i.test(ca[1]!) ? 'USD' : 'AFGHANI';
    else {
      const cb = CURRENCY_BEFORE.exec(lineBefore);
      if (cb) currency = /دالر|دلار|ډالر|usd|\$/i.test(cb[1]!) ? 'USD' : 'AFGHANI';
    }
    const keyword = PRICE_KEYWORD.test(lineBefore);
    // A bare number is a price only when it is plainly one: written with a keyword, a unit or a currency, or so large
    // that nothing else it could be («1,700,000», «۱۷۰۰۰۰۰»).
    const hugeBare = !unit && !currency && !keyword && base >= 1_000_000 && !NOT_PRICE_BEFORE.test(lineBefore);
    if (!unit && !currency && !keyword && !hugeBare) continue;
    if (!unit && NOT_PRICE_BEFORE.test(lineBefore) && !currency) continue;

    let value = base * (unit ? UNIT_VALUE[unit]! : 1);
    if (g.half1 || g.half2) value += 0.5 * (unit ? UNIT_VALUE[unit]! : 1);
    if (unit && g.n2 && g.u2 && UNIT_VALUE[g.u2]! < UNIT_VALUE[unit]!) value += Number(g.n2.replace(/,/g, '')) * UNIT_VALUE[g.u2]!;
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

/** What the price is said to be: «قابل معامله نیست», «مقطوع», «بې چانې»: not to be bargained over. Checked first, because it often contains the words of the other kind. */
const FIXED_TERMS = new RegExp(
  [
    whole('مقطوع|مقطوعه|قطعی بیه|نهایی بیه|بدون چانه|بدون معامله|بدون مذاکره|بدون کم و کسر|بی چانه|بې چانې|بې له چانې|چانه نشته|معامله نشته'),
    whole('قیمت (?:نهایی|قطعی|ثابت|مقطوع)|نرخ (?:نهایی|قطعی|ثابت)|بیه (?:قطعی|نهایی)'),
    // «چانه ندارد», «معامله ندارد», «کم نمی شود», «کم و کسر ندارد»
    whole('(?:چانه|معامله|مذاکره|بحث|کم و کسر|تخفیف)\\s+(?:ندارد|ندارند|نمی ?خورد|نمی ?شود|نیست|نشته)'),
    // «قابل معامله نیست», «قابل چانه نمی‌باشد», «د معاملې وړ نه دی»
    whole('قابل (?:معامله|بحث|مذاکره|چانه|گفتگو|توافق|تخفیف)(?: [^\\s]+){0,2}? (?:نیست|نمی ?باشد|نمی ?شود|نه)'),
    whole('د (?:معاملې|توافق|جوړجاړي) وړ نه'),
  ].join('|'),
  'u',
);
/** «جور آمد», «قابل معامله», «توافقی», «چانه دارد»: the price is open to talk. */
const NEGOTIABLE_TERMS = new RegExp(
  [
    whole('جور ?آمد|جور ?امد|جور (?:است|می ?شود|میشه)|جور آمدنی'),
    whole('قابل (?:معامله|بحث|مذاکره|چانه|گفتگو|توافق|تخفیف)'),
    whole('توافقی|توافقی است|قابل توافق|قیمت توافقی|مذاکره (?:می ?شود|دارد)|بحث دارد'),
    whole('(?:چانه|معامله|کم و کسر|تخفیف) (?:دارد|دارند|می ?خورد|می ?شود|هم دارد)|چانه ?زنی|چانه زدن'),
    whole('د معاملې وړ|د توافق وړ|د جوړجاړي وړ|چانه لري|معامله لري|په توافق'),
  ].join('|'),
  'u',
);

export function detectPriceTerms(flat: string): PriceTerms | null {
  if (FIXED_TERMS.test(flat)) return 'FIXED';
  if (NEGOTIABLE_TERMS.test(flat)) return 'NEGOTIABLE';
  return null;
}

// ───────────── Area, rooms ─────────────

const AREA_UNIT = '(?:متر\\s*مربع|مترمربع|متری\\s*مربع|متر|متری|مترې|مترو|متره|م2|م²|m2|m²|sqm)';
const AREA_RE = new RegExp(`(?<![\\d.,])(\\d+(?:\\.\\d+)?)\\s*${AREA_UNIT}(?![${WORD}])`, 'giu');
const AREA_LABEL_RE = new RegExp(`(?<![${WORD}])(?:مساحت(?:\\s+(?:زمین|کل|کلی|ملک|حویلی|خانه))?|مساحه|رقبه(?:\\s+زمین)?|متراژ|اندازه)\\s*[:：=]?\\s*(\\d+(?:\\.\\d+)?)(?![\\d.,]|\\s*(?:جریب|بسوه))`, 'giu');
const STREET_BEFORE = /(کوچه|کوڅه|سرک|سړک|جاده|خیابان|عرض|پهنا|راه|مسیر|دیوار|ارتفاع)\s*[:：]?\s*(?:ی|به)?\s*$/u;
const BUILT_BEFORE = /(زیربنا|زیر بنا|بنا|ساخته|ساختمان|ودانۍ|فضای)\s*[:：]?\s*$/u;
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

export const findBedrooms = (flat: string) => countBefore(flat, 'اتاق خواب|اتاق ها|اتاقها|اتاقه|اتاق|کمره|خوابه|خواب|خوب خونې|خوبو|خونې|خونو|خونه');
export const findBathrooms = (flat: string) => countBefore(flat, 'حمام ها|حمامها|حمام|حمامونه|حمامو|تشناب|تشناب ها|توالت|دستشویی|بیت الخلا|غسلخانه');

// ───────────── Floors ─────────────

/** What a house with this many floors is called: «دو طبقه», «دوطبقه», «۲ طبقه», «سه منزله», «دو پوړیزه», «یک‌طبقه», «تک طبقه». */
const FLOORS_RE = new RegExp(
  `(?<![${WORD}])(?<n>\\d{1,2}|${WORD_NUMBER}|تک)\\s*(?:طبقه(?:\\s?ای)?|منزله|پوړیزه|پوړیز|پوړه|پوړ)(?![${WORD}])`,
  'u',
);
/** Only these have storeys of their own: an apartment's «طبقه» is its place in the building, a plot has none. */
const FLOOR_TYPES: readonly (PropertyType | '')[] = ['', 'HOUSE_HAWILI', 'VILLA', 'SHOP', 'OFFICE', 'GARDEN', 'OTHER'];

/** How many storeys the text says the property has («خانه نوساز دوطبقه» → 2), or null. */
export function findFloors(flat: string, type: PropertyType | '' = ''): number | null {
  if (!FLOOR_TYPES.includes(type)) return null;
  const m = FLOORS_RE.exec(flat);
  if (!m) return null;
  const word = m.groups!.n!;
  const n = word === 'تک' ? 1 : numberFrom(word);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

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
    { needle: p.name_ps, province: p.name },
    ...(p.capital_ps ? [{ needle: p.capital_ps, province: p.name }] : []),
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
/** Units only Afghani prices are written in. */
const AFGHANI_UNITS = new Set(['لک', 'لکه', 'لکھ', 'کرور']);
const toPersianDigits = (s: string) => s.replace(/\d/g, (d) => PERSIAN_DIGIT[Number(d)]!);

export function findDistrict(flat: string): string | null {
  const m = new RegExp(`(?<![${WORD}])ناحیه\\s*(?:شماره\\s*)?(\\d{1,2}|${WORD_NUMBER})(?![\\d])`, 'u').exec(flat);
  if (!m) return null;
  const n = numberFrom(m[1]!);
  return n === null ? null : `ناحیه ${toPersianDigits(String(n))}`;
}

const LOCALITY_STOP = new Set(['فروشی', 'فروش', 'برای', 'دارای', 'با', 'و', 'در', 'است', 'که', 'قیمت', 'مساحت', 'کرایی', 'کرایه', 'گروی', 'تماس', 'شماره', 'آدرس', 'موقعیت', 'مناسب', 'ناحیه', 'نزدیک', 'پهلوی', 'خانه', 'منزل', 'حویلی', 'زمین', 'آپارتمان', 'دکان', 'ویلا', 'باغ', 'دفتر', 'متر']);
const LOCALITY_RE = new RegExp(`(?<![${WORD}])(?:کارته|شهرک|قلعه|مکروریان|چهارراهی|پروژه|گذر|ساحه|منطقه|تپه|دشت|ده|کلی|ښارګوټی)\\s+[${WORD}]+(?:\\s+[${WORD}]+){0,2}`, 'gu');

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

const ADDRESS_LABEL_RE = /(?:^|\n)\s*[^\n\p{L}]*(?:آدرس|ادرس|نشانی|پته|موقعیت|محل|موقعیت ملک|آدرس ملک)\s*[:：]\s*([^\n]+)/u;

export function findAddress(flat: string): string | null {
  const m = ADDRESS_LABEL_RE.exec(flat);
  if (!m) return null;
  const text = toPersianDigits(stripDecoration(m[1]!)).replace(/,/g, '،');
  return text.length >= 3 ? cutAt(text, 300) : null;
}

const STREET_WORD = 'سرک|سړک|کوچه|کوڅه|جاده|خیابان|چهارراهی|چهار راهی|گذر|لین';
/** «کوچه ۶ متری»: how wide the lane is, not where the house is. */
const LANE_WIDTH = /^\s*\d+(?:\.\d+)?\s*(?:متر|متری|م)(?![\p{L}])/u;
/** Where a street line stops: a sentence end, or the start of something that is not part of an address. */
const STREET_END = new RegExp(
  `\\s*(?:[.!؛;|•]|(?<![${WORD}])(?:${CONTACT_WORD}|قیمت|بها|مبلغ|مساحت|متراژ|آدرس|ادرس|کد|دارای|برای|است|می‌?باشد|میباشد)(?![${WORD}])).*$`,
  'iu',
);
const MONEY_OR_AREA = new RegExp(`(?<![${WORD}.,])\\d[\\d,.]*\\s*(?:لک|لکه|هزار|میلیون|ملیون|کرور|دالر|دلار|افغانی|متر|متری|\\$|usd)(?![${WORD}])`, 'iu');

/**
 * The street part of an address the text gives without a label: «سرک آسیا کلوخی، بهارستان ۱۲» out of
 * «هرات سرک آسیا کلوخی، بهارستان ۱۲ شماره تماس ...». It starts at the street word and runs through the comma-separated
 * pieces after it («، بهارستان ۱۲») until the line, a phone number, a price or a word that starts something else ends it.
 * Digits come back as Persian digits.
 */
export function findStreet(flat: string): string | null {
  const re = new RegExp(`(?<![${WORD}])(?:${STREET_WORD})(?![${WORD}])`, 'gu');
  for (const m of flat.matchAll(re)) {
    const rest = flat.slice(m.index! + m[0].length);
    if (LANE_WIDTH.test(rest)) continue;
    let line = flat.slice(m.index!, m.index! + m[0].length + (rest.indexOf('\n') < 0 ? rest.length : rest.indexOf('\n')));
    for (const [a] of phoneSpans(line)) {
      line = line.slice(0, a);
      break;
    }
    const money = MONEY_OR_AREA.exec(line);
    if (money) line = line.slice(0, money.index);
    line = line.replace(STREET_END, '');
    // Keep the pieces up to one that names the property itself («، خانه دو طبقه») rather than a place.
    const pieces: string[] = [];
    for (const piece of line.split(/[,،]/)) {
      const text = stripDecoration(piece);
      if (!text) continue;
      if (pieces.length > 0 && (detectType(text) !== null || detectDeal(text) !== null)) break;
      pieces.push(text);
      if (pieces.length >= 4) break;
    }
    const street = pieces.join('، ');
    if (street.length >= 4 && /\p{L}/u.test(street.replace(new RegExp(STREET_WORD, 'gu'), ''))) return toPersianDigits(cutAt(street, 200));
  }
  return null;
}

// ───────────── Pieces of the text ─────────────

const IMAGE_RE = /https?:\/\/[^\s)>\]"']+\.(?:jpe?g|png|webp)(?:\?[^\s)>\]"']*)?/giu;
const CONTACT_LABEL_LINE = /^[^\p{L}\p{N}]*(?:شماره\s*)?(?:تماس|تلفن|تلیفون|موبایل|اړیکه|واتساپ|واتس اپ|وتساپ|whatsapp|contact|call)[^\p{L}\p{N}]*$/iu;

/** Digit-normalised copy of the same length, so positions found in it are positions in the original. */
function asciiSameLength(text: string): string {
  return text.replace(/[۰-۹]/g, (c) => String(PERSIAN_DIGIT.indexOf(c))).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

/** «شماره تماس:», «واتساپ -», «📞» in front of a number: it goes with the number. */
const LABEL_BEFORE_PHONE = new RegExp(`(?:(?<![${WORD}])(?:${CONTACT_WORD})(?![${WORD}])[^\\p{L}\\p{N}]*(?:و[^\\p{L}\\p{N}]*)?)+$`, 'iu');

export function stripPhoneNumbers(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const ascii = asciiSameLength(line);
    const spans = phoneSpans(ascii);
    let current = line;
    if (spans.length > 0) {
      removed += spans.length;
      current = '';
      let last = 0;
      for (const [a, b] of spans) {
        const label = LABEL_BEFORE_PHONE.exec(ascii.slice(last, a));
        current += line.slice(last, label ? last + label.index : a);
        last = b;
      }
      current += line.slice(last);
    }
    const tidy = current.replace(/[ \t]+/g, ' ').replace(/\s+([،,.:：])/g, '$1').trim();
    // A line with nothing but a label or a symbol left (the 📞 in front of a number) is dropped, but only a line that held
    // a number: an empty line between two paragraphs stays.
    if (spans.length > 0 && !/[\p{L}\p{N}]/u.test(tidy)) continue;
    if (CONTACT_LABEL_LINE.test(tidy)) continue;
    lines.push(tidy);
  }
  if (removed === 0) return { text, removed: 0 };
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/** Lines that give one fact under a label — «قیمت فروش: ...», «آدرس: ...», «نوع ملک: خانه» — and so are never a listing's start or title. */
const STRONG_LABEL = new RegExp(`^(?:قیمت|بها|بیه|مبلغ|نرخ|آدرس|ادرس|نشانی|پته|مساحت|متراژ|رقبه|تماس|تلفن|تلیفون|شماره تماس|موبایل|واتساپ|واتس اپ|اړیکه|توضیحات|تشریحات|مشخصات|امکانات|جزئیات|شرایط معامله)(?![${WORD}])`, 'iu');
const WEAK_LABEL = new RegExp(`^(?:موقعیت|محل|نوعیت|نوع|کد|کود|آی دی|ایدی|id|تعداد|اتاق|حمام|طبقه|منزل|سند|نوع سند|وضعیت|پرداخت|سال ساخت|زیربنا|جهت|نما|اندازه|ساحه|نوت|نوټ|نکته|نکات|ملاحظه|ملاحظات|یادداشت|توجه|تذکر|هشدار|شرایط|شرط|شروط|معلومات|قابل توجه)(?:\\s+[${WORD}]+){0,2}\\s*[:：=]`, 'iu');
export const isDetailLine = (flatLine: string) => STRONG_LABEL.test(flatLine) || WEAK_LABEL.test(flatLine);

/** «کد: 245», «VIP», «#فوری», «شماره آگهی ۱۲»: the tag line above a post, not the post. */
const HEADER_LINE = new RegExp(
  `^(?:(?:کد|کود|ایدی|آی دی|id)(?![${WORD}])|(?:شماره|نمبر)\\s*(?:آگهی|ملک|اعلان)|(?:vip|ویژه|فوری|جدید|new|لاین|توجه(?:\\s+توجه)*|آگهی|اعلان|اطلاعیه|مهم|فرصت طلایی)$|#[^\\s]+(?:\\s+#[^\\s]+)*$)`,
  'iu',
);
const isHeaderLine = (flatLine: string) => HEADER_LINE.test(flatLine.trim());

/** Channel and link footers: «@channel», «t.me/…», «instagram.com/…», «wa.me/…» and any other web link that is not a photo. */
const PROMO_LINK = /(?:t\.me\/|telegram\.me\/|wa\.me\/|instagram\.com|facebook\.com|youtube\.com|tiktok\.com|@[A-Za-z0-9_]{4,}|https?:\/\/(?![^\s]+\.(?:jpe?g|png|webp)(?:[?\s]|$)))/iu;
const PROMO_WORDS = /(?:کانال|چنل|channel|join|جوین|دنبال کنید|ما را|صفحه ما|فالو|follow|املاک|بنگاه|مشاور|معاملات ملکی|خرید و فروش|خریدوفروش|آدرس دفتر|گروپ|گروه ما)/iu;

/**
 * The advertisement's own number, written by the channel or the system that made the post — «📌 کد آگهی: #2005»,
 * «کد: 245 | VIP», «شماره آگهی ۱۲»: a line that is nothing but that label, a short code and perhaps a tag. It says
 * nothing about the property, so it is not part of the description.
 */
const AD_LABEL = '(?:(?:کد|کود|ایدی|آی[\\s\u200c]?دی|id)(?:[\\s\u200c]*(?:آگهی|اگهی|ملک|اعلان|پست))?|(?:شماره|نمبر)[\\s\u200c]*(?:آگهی|اگهی|ملک|اعلان|پست))';
const AD_DIGIT = '0-9\\u06F0-\\u06F9\\u0660-\\u0669';
/** A short code that has at least one digit in it: «2005», «#2005», «A-12»; a plain word is not a code. */
const AD_CODE_TOKEN = `#?(?=[A-Za-z_/\\-]*[${AD_DIGIT}])[A-Za-z${AD_DIGIT}_/\\-]{1,14}`;
const AD_TAG = '(?:vip|ویژه|فوری|جدید|new|مهم|لاین)';
const AD_SEPARATOR = '[\\s|\\-–—•·,،/:：=]';
const AD_CODE_LINE = new RegExp(
  `^(?=[^\\n]*[${AD_DIGIT}])[^\\p{L}\\p{N}]*${AD_LABEL}[\\s:：=#\\-–—]*(?:${AD_CODE_TOKEN}|${AD_TAG})(?:${AD_SEPARATOR}*(?:${AD_CODE_TOKEN}|${AD_TAG})){0,3}[^\\p{L}\\p{N}]*$`,
  'iu',
);
/** The same, at the start of a line that goes on with the property: «کد آگهی: 2005 | خانه دو طبقه ...». */
const AD_CODE_PREFIX = new RegExp(
  `^[^\\p{L}\\p{N}]*${AD_LABEL}[\\s:：=#\\-–—]*${AD_CODE_TOKEN}(?:${AD_SEPARATOR}*${AD_TAG})*[\\s]*[|\\-–—•·،,][\\s|\\-–—•·،,]*(?=[\\p{L}\\p{N}])`,
  'iu',
);

export function stripAdCodes(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (AD_CODE_LINE.test(line)) {
      removed += 1;
      continue;
    }
    const prefix = AD_CODE_PREFIX.exec(line);
    if (prefix) {
      removed += 1;
      lines.push(line.slice(prefix[0].length).trim());
      continue;
    }
    lines.push(line);
  }
  if (removed === 0) return { text, removed: 0 };
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

function titleLine(raw: string): string | null {
  for (const rawLine of raw.split('\n')) {
    const line = stripDecoration(rawLine.replace(IMAGE_RE, ''))
      .replace(/^(?:عنوان|سرلیک|موضوع)\s*[:：]\s*/u, '');
    if (!line) continue;
    if (!/\p{L}/u.test(line)) continue; // only a number or symbols
    const flatText = flatten(line);
    if (isDetailLine(flatText) || isHeaderLine(flatText) || PROMO_LINK.test(flatText)) continue; // a label line or tag is not a title
    const flat = flatten(line);
    const mostlyPhone = phoneSpans(asciiSameLength(line)).length > 0 && flat.replace(/[\d\s+-]/g, '').length < 6;
    if (mostlyPhone) continue;
    if (line.length < 8) return null;
    return cutAt(line, 150);
  }
  return null;
}

/**
 * «خانه سه خوابه ۲۰۰ متری برای فروش در ناحیه ۴ کابل», written in `language` (the one on screen by default). Pass the
 * language explicitly when this runs while rendering, where the browser-wide one is not available (the server).
 */
export function composeTitle(
  f: { type?: PropertyType | ''; deal?: DealType | ''; bedrooms?: number | null; floors?: number | null; area?: number | null; district?: string; province?: string },
  language: Language = activeLanguage(),
): string {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(language, key, params);
  const labels = labelsFor(language);
  const parts: string[] = [];
  parts.push(f.type ? (labels.type[f.type].split(' / ')[0] ?? labels.type[f.type]) : t('title.property'));
  if (f.floors && f.floors > 1) parts.push(t('title.floors', { n: formatNumber(f.floors) }));
  if (f.bedrooms && f.type && hasRoomsFor(f.type)) parts.push(t('title.rooms', { n: formatNumber(f.bedrooms) }));
  if (f.area) parts.push(t('title.area', { n: formatNumber(f.area) }));
  if (f.deal) parts.push(t(f.deal === 'SALE' ? 'title.SALE' : f.deal === 'RENT' ? 'title.RENT' : 'title.MORTGAGE_GROWI'));
  const place = [f.district, f.province ? provinceNameLabel(f.province, language) : ''].filter(Boolean).join(' ');
  if (place) parts.push(t('title.in', { place }));
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

  const deal = detectDeal(flat);
  if (deal) row.deal_type = deal;
  else if (defaults.deal_type) {
    row.deal_type = defaults.deal_type;
    notes.push(tNow('import.note.dealDefault', { deal: labelsNow().deal[defaults.deal_type] }));
  } else {
    row.deal_type = 'SALE';
    notes.push(tNow('import.note.dealAssumed', { deal: labelsNow().deal.SALE }));
  }

  const price = findPrice(flat);
  if (price) {
    row.price = String(price.value);
    // «لک» and «کرور» are Afghani words: a pinned default of dollars must not turn «۱۰ لک» into dollars.
    if (price.currency) row.currency = price.currency;
    else if (price.unit && AFGHANI_UNITS.has(price.unit)) row.currency = 'AFGHANI';
    else {
      const guess: Currency = defaults.currency || 'AFGHANI';
      row.currency = guess;
      notes.push(tNow(defaults.currency ? 'import.note.currencyDefault' : 'import.note.currencyGuess', { currency: currencyName(guess) }));
    }
    if (price.assumedKarur) notes.push(tNow('import.note.karur'));
    if (price.candidates > 1) notes.push(tNow('import.note.manyPrices'));
  } else if (defaults.currency) row.currency = defaults.currency;

  const terms = detectPriceTerms(flat);
  if (terms) row.price_terms = terms;

  const area = findArea(flat);
  if (area.value !== null) {
    row.area_sqm = String(area.value);
    if (area.fromDimensions) notes.push(tNow('import.note.areaDims'));
  } else if (area.jerib) {
    notes.push(tNow('import.note.areaJerib'));
  }

  if (row.type === '' || hasRoomsFor(row.type)) {
    const bedrooms = findBedrooms(flat);
    if (bedrooms !== null) row.bedrooms = String(bedrooms);
    const bathrooms = findBathrooms(flat);
    if (bathrooms !== null) row.bathrooms = String(bathrooms);
  }

  if (!row.type || FLOOR_TYPES.includes(row.type)) {
    const floors = findFloors(flat, row.type);
    if (floors !== null) row.floors = String(floors);
  }

  const phone = findPhones(block)[0];
  if (phone) row.phone = phone;

  const province = findProvince(flat);
  row.province = province ?? defaults.province;
  if (!province && defaults.province) notes.push(tNow('import.note.provincePinned', { province: defaults.province }));

  const district = findDistrict(flat);
  row.district = district ?? defaults.district;
  const neighborhood = findNeighborhood(flat);
  if (neighborhood) row.neighborhood = neighborhood;

  const written = findAddress(flat);
  const street = written ? null : findStreet(flat);
  if (written) row.address = written;
  else if (street) {
    // «هرات، سرک آسیا کلوخی، بهارستان ۱۲»: the street as written, behind the province (and district) it is in.
    row.address = addressFrom({ province: row.province, district: row.district, neighborhood: row.neighborhood, street });
  } else {
    row.address = addressFrom({ province: row.province, district: row.district, neighborhood: row.neighborhood, street: '' });
    if (row.address && row.address !== row.province) notes.push(tNow('import.note.addressBuilt'));
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
  // The advertisement's own number («📌 کد آگهی: #2005») is never part of the description; the rest is kept as pasted.
  description = stripAdCodes(description).text;
  const pasted = description;
  if (options.stripPhones === true) {
    // Asked for (the switch above the text): numbers and channel footers («@agency», «t.me/…», advertising for somewhere
    // else) come out. By default nothing does: the description is everything that was pasted.
    description = stripPhoneNumbers(description).text;
    const kept = description.split('\n').filter((l) => !PROMO_LINK.test(flatten(l)));
    if (kept.length !== description.split('\n').length && kept.some((l) => l.trim())) {
      description = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
  }

  const title = titleLine(description) ?? composeTitle({
    type: row.type,
    deal: row.deal_type,
    bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
    floors: row.floors ? Number(row.floors) : null,
    area: row.area_sqm ? Number(row.area_sqm) : null,
    district: row.district,
    province: row.province,
  });
  row.title = title;
  row.description = cutAt(description || title, 5000);
  // A listing holds at most 5000 characters of description: say so rather than cut the end off in silence.
  if ((description || title).length > 5000 && pasted.length > 5000) notes.push(tNow('import.note.descriptionCut'));
  row.notes = notes;
  return row;
}

// ───────────── Many listings in one paste ─────────────

const FIRST_LINE_SIGNAL = (flatFirstLine: string) => detectType(flatFirstLine) !== null || detectDeal(flatFirstLine) !== null;

const contentLines = (block: string) => block.split('\n').map(stripDecoration).filter((l) => l.length > 0);

interface BlockFacts {
  flat: string;
  first: string;
  price: boolean;
  area: boolean;
  type: boolean;
  deal: boolean;
}

function factsOf(block: string): BlockFacts {
  const flat = flatten(block);
  const first = flatten(contentLines(block)[0] ?? '');
  return { flat, first, price: findPrice(flat) !== null, area: findArea(flat).value !== null, type: detectType(flat) !== null, deal: detectDeal(flat) !== null };
}

type Kind = 'listing' | 'continuation' | 'header' | 'promo';

/**
 * What a block of the paste is. A post often arrives in pieces (a tag line, the description, a «قیمت فروش: …» paragraph,
 * a contact paragraph, a channel footer); only the piece that opens like a listing starts a new one.
 *  - promo: advertising for the agent or channel with nothing about a property: kept with the listing before it (it may
 *    hold the office's address or number; taking it out is the owner's choice, the switch above the text).
 *  - header: «کد: 245 VIP»: kept and put in front of the listing that follows.
 *  - continuation: belongs to the listing before it.
 *  - listing: starts a new one.
 * `separated` is true when the paste uses explicit separator lines, which are a stronger sign of a boundary.
 */
function classify(block: string, separated: boolean, previous: BlockFacts | null): Kind {
  const f = factsOf(block);
  const hasFacts = f.price || f.area;
  const lines = contentLines(block).map(flatten);
  if (!hasFacts && (PROMO_LINK.test(f.flat) || PROMO_WORDS.test(f.flat))) return 'promo';
  if (!hasFacts && !f.type && !f.deal && lines.length > 0 && lines.length <= 2 && lines.every(isHeaderLine)) return 'header';
  if (isDetailLine(f.first)) return 'continuation';
  if (FIRST_LINE_SIGNAL(f.first)) return 'listing';
  if (separated && (f.type || f.deal || hasFacts)) return 'listing';
  // No opening signal in the first line (a banner like «🔥 فرصت طلایی 🔥»): a whole listing all the same when it names a
  // property and a price and the one before is already complete.
  if ((f.type || f.deal) && f.price && previous?.price) return 'listing';
  return 'continuation';
}

/** Cuts a paste into one text per listing. */
export function splitListings(raw: string, options: { single?: boolean } = {}): string[] {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (options.single) return [text];

  const lines = text.split('\n');
  const separated = lines.some(isSeparatorLine);
  let pieces: string[];
  if (separated) {
    pieces = [];
    let current: string[] = [];
    for (const line of lines) {
      if (isSeparatorLine(line)) {
        if (current.join('').trim()) pieces.push(current.join('\n').trim());
        current = [];
      } else current.push(line);
    }
    if (current.join('').trim()) pieces.push(current.join('\n').trim());
  } else {
    pieces = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }

  const merged: string[] = [];
  let held = ''; // a tag line (or a greeting) waiting for its listing
  for (const piece of pieces) {
    const previous = merged.length ? factsOf(merged[merged.length - 1]!) : null;
    const kind = classify(piece, separated, previous);
    if (kind === 'promo') {
      // Nothing is thrown away: a footer belongs to the listing above it, or opens the first one.
      if (merged.length) merged[merged.length - 1] += `\n${piece}`;
      else held = held ? `${held}\n${piece}` : piece;
      continue;
    }
    if (kind === 'header') {
      held = held ? `${held}\n${piece}` : piece;
      continue;
    }
    if (kind === 'listing' || merged.length === 0) {
      // A first piece that names nothing (a greeting) is not a listing: it waits and joins the first real one.
      if (kind === 'continuation') {
        const f = factsOf(piece);
        if (!f.type && !f.deal && !f.price && !f.area) {
          held = held ? `${held}\n${piece}` : piece;
          continue;
        }
      }
      merged.push(held ? `${held}\n${piece}` : piece);
      held = '';
    } else {
      merged[merged.length - 1] += `${held ? `\n${held}` : ''}\n${piece}`;
      held = '';
    }
  }

  // A tag or footer left over at the end still belongs to the last listing.
  if (held && merged.length) merged[merged.length - 1] += `\n${held}`;

  // No blank lines at all: one listing per line when each line carries its own type/deal and price.
  return merged.flatMap((block) => {
    const blockLines = block.split('\n').filter((l) => l.trim());
    if (blockLines.length < 2) return [block];
    const full = blockLines.filter((l) => {
      const f = flatten(l);
      return FIRST_LINE_SIGNAL(f) && !isDetailLine(f) && findPrice(f) !== null;
    });
    if (full.length < 2) return [block];
    const out: string[] = [];
    for (const l of blockLines) {
      const f = flatten(l);
      if (FIRST_LINE_SIGNAL(f) && !isDetailLine(f) && findPrice(f) !== null) out.push(l);
      else if (out.length) out[out.length - 1] += `\n${l}`;
      else out.push(l);
    }
    return out;
  });
}

export function parseText(raw: string, options: ParseOptions = {}): DraftRow[] {
  return splitListings(raw, { single: options.single }).map((block) => parseListing(block, options));
}
