import type { Currency, DealType, PriceTerms, PropertyType } from '@bongah/shared-types';
import { PROPERTY_TYPES } from '@bongah/shared-types';
import { addressFrom } from '../address';
import { provinceNameLabel } from '../provinces';
import { currencyName, parseLooseNumber } from '../format';
import { labelsFor, labelsNow } from '../labels';
import { activeLanguage, tNow } from '@/i18n/active';
import { translate } from '@/i18n/translate';
import type { Language } from '@/i18n/config';
import { detectDeal, detectPriceTerms, detectType, findArea, findPrice, findProvince } from './parse-text';
import { composeTitle } from './parse-text';
import { flatten } from './text-utils';
import { emptyDraft, NO_PIN, type DraftRow, type PinnedDefaults } from './types';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_ROWS = 1000;

/** The columns an import understands (their names, in the language shown, are `import.field.<key>`). */
export const IMPORT_FIELD_KEYS = [
  'title',
  'description',
  'type',
  'deal_type',
  'price',
  'currency',
  'price_terms',
  'area_sqm',
  'bedrooms',
  'bathrooms',
  'province',
  'district',
  'neighborhood',
  'address',
  'lat',
  'lng',
  'images',
] as const;

export type ImportField = (typeof IMPORT_FIELD_KEYS)[number];

/** The label of a column in the mapping step, in `language` (the one on screen by default). */
export const importFieldLabel = (field: ImportField, language: Language = activeLanguage()): string => translate(language, `import.field.${field}`);

/** [key, label] for every column, in the language given. */
export const importFields = (language: Language = activeLanguage()) => IMPORT_FIELD_KEYS.map((key) => [key, importFieldLabel(key, language)] as const);

/** Header words (Dari, Pashto, English). They are compared after `normalizeHeader`, which also reduces the words below. */
const RAW_SYNONYMS: Record<ImportField, string[]> = {
  title: ['عنوان', 'سرلیک', 'تیتر', 'نام ملک', 'نام', 'title', 'name', 'headline'],
  description: ['توضیحات', 'تشریح', 'شرح', 'جزئیات', 'مشخصات', 'description', 'desc', 'details', 'notes'],
  type: ['نوع ملک', 'نوع ملکیت', 'د ملکیت ډول', 'ملکیت ډول', 'نوع', 'دسته', 'type', 'property type', 'category', 'kind'],
  deal_type: ['نوع معامله', 'نوع آگهی', 'د معاملې ډول', 'معاملې ډول', 'معامله', 'د اعلان ډول', 'deal', 'deal type', 'listing type', 'purpose'],
  price: ['قیمت', 'مبلغ', 'بها', 'نرخ', 'بیه', 'price', 'amount', 'cost'],
  currency: ['ارز', 'واحد پول', 'واحد', 'د پیسو واحد', 'پیسې', 'اسعار', 'currency', 'unit'],
  price_terms: ['شرایط قیمت', 'د بیې شرایط', 'شرایط', 'مقطوع', 'جورآمد', 'price terms', 'terms', 'negotiable'],
  area_sqm: ['متراژ', 'مساحت', 'متر', 'مترې', 'area', 'size', 'sqm', 'area sqm', 'square meters'],
  bedrooms: ['اتاق خواب', 'خوب خونې', 'خوبه', 'خونې', 'تعداد اتاق', 'اتاق', 'خواب', 'bedrooms', 'beds', 'rooms', 'bedroom'],
  bathrooms: ['حمام', 'حمامونه', 'تعداد حمام', 'bathrooms', 'baths', 'bathroom'],
  province: ['ولایت', 'استان', 'شهر', 'province', 'state', 'city'],
  district: ['ناحیه', 'ناحیه ولسوالی', 'ولسوالی', 'ولسوالي', 'منطقه', 'district', 'zone'],
  neighborhood: ['محله', 'شهرک', 'کارته', 'neighborhood', 'neighbourhood', 'locality'],
  address: ['آدرس', 'پته', 'نشانی', 'موقعیت', 'address', 'location'],
  lat: ['عرض جغرافیایی', 'جغرافیایی عرض', 'عرض', 'lat', 'latitude'],
  lng: ['طول جغرافیایی', 'جغرافیایی اوږدوالی', 'اوږدوالی', 'طول', 'lng', 'lon', 'long', 'longitude'],
  images: ['عکس', 'عکس ها', 'انځور', 'انځورونه', 'انځورونه پته', 'عکس ها نشانی', 'تصویر', 'تصاویر', 'نشانی عکس', 'images', 'image', 'photos', 'photo', 'pictures', 'image urls'],
};

function normalizeHeader(h: string): string {
  return flatten(h)
    .toLowerCase()
    .replace(/[_\-./()[\]:*]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The synonyms above, reduced the same way as the headers they are compared with (so «ي» in Pashto matches). */
const SYNONYMS = Object.fromEntries(
  (Object.keys(RAW_SYNONYMS) as ImportField[]).map((field) => [field, RAW_SYNONYMS[field].map(normalizeHeader)]),
) as Record<ImportField, string[]>;

/** Guesses which column is which from the header row; a column that matches nothing is left unmapped (null). */
export function guessMapping(headers: readonly string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  const mapping: (ImportField | null)[] = headers.map(() => null);
  const exact = headers.map(normalizeHeader);

  // Exact synonyms first, so «نوع» does not steal «نوع معامله».
  exact.forEach((h, i) => {
    for (const field of Object.keys(SYNONYMS) as ImportField[]) {
      if (!used.has(field) && SYNONYMS[field].includes(h)) {
        mapping[i] = field;
        used.add(field);
        return;
      }
    }
  });
  // Then a header that contains a synonym ("قیمت کل (افغانی)"), longest synonym first.
  exact.forEach((h, i) => {
    if (mapping[i] || !h) return;
    let best: { field: ImportField; len: number } | null = null;
    for (const field of Object.keys(SYNONYMS) as ImportField[]) {
      if (used.has(field)) continue;
      for (const s of SYNONYMS[field]) {
        if (s.length >= 3 && h.includes(s) && (!best || s.length > best.len)) best = { field, len: s.length };
      }
    }
    if (best) {
      mapping[i] = best.field;
      used.add(best.field);
    }
  });
  return mapping;
}

// ───────────── Cells ─────────────

const TYPE_EN: [PropertyType, RegExp][] = [
  ['APARTMENT', /apartment|flat|condo/i],
  ['VILLA', /villa/i],
  ['GARDEN', /garden|orchard/i],
  ['SHOP', /shop|store|kiosk/i],
  ['OFFICE', /office/i],
  ['LAND', /land|plot|lot/i],
  ['GARAGE', /garage|parking/i],
  ['HOUSE_HAWILI', /house|home|hawili|haweli/i],
  ['OTHER', /other/i],
];

export function normalizeType(cell: string): PropertyType | null {
  const raw = cell.trim();
  if ((PROPERTY_TYPES as readonly string[]).includes(raw.toUpperCase())) return raw.toUpperCase() as PropertyType;
  const flat = flatten(raw);
  const fa = detectType(flat);
  if (fa) return fa;
  for (const [type, re] of TYPE_EN) if (re.test(flat)) return type;
  if (/^(دیگر|سایر|متفرقه|نور|بل)$/u.test(flat.trim())) return 'OTHER';
  return null;
}

export function normalizeDeal(cell: string): DealType | null {
  const raw = cell.trim().toUpperCase();
  if (raw === 'SALE' || raw === 'RENT' || raw === 'MORTGAGE_GROWI') return raw;
  const flat = flatten(cell);
  const fa = detectDeal(flat);
  if (fa) return fa;
  if (/\b(sale|sell|buy)\b/i.test(flat)) return 'SALE';
  if (/\b(rent|lease)\b/i.test(flat)) return 'RENT';
  if (/mortgage|pledge|growi|gravi/i.test(flat)) return 'MORTGAGE_GROWI';
  return null;
}

export function normalizeCurrency(cell: string): Currency | null {
  const flat = flatten(cell).toLowerCase();
  if (/^(afghani|afn|afs|افغانی|افغانیه|افغانۍ|؋|af)$/u.test(flat.trim()) || flat.includes('افغانی') || flat.includes('افغانۍ')) return 'AFGHANI';
  if (/^(usd|us\$|\$|dollar|dollars|دالر|دلار|ډالر)$/u.test(flat.trim()) || flat.includes('دالر') || flat.includes('دلار') || flat.includes('ډالر')) return 'USD';
  return null;
}

export function normalizeTerms(cell: string): PriceTerms | null {
  const flat = flatten(cell).toLowerCase();
  // A sentence («قابل معامله نیست», «چانه ندارد») is read the way a pasted post is: its negation counts.
  const said = detectPriceTerms(flat);
  if (said) return said;
  if (/مقطوع|ثابت|قطعی|fixed|final/u.test(flat)) return 'FIXED';
  if (/جورآمد|جور آمد|قابل|توافق|معاملې وړ|negotiable|open/u.test(flat)) return 'NEGOTIABLE';
  return null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, ' ').trim();
}

export interface FileTable {
  headers: string[];
  rows: string[][];
}

/** Turns a grid of cells (CSV or sheet) into a header row and text rows; empty rows and trailing empty columns drop. */
export function tableFrom(grid: readonly (readonly unknown[])[]): FileTable {
  const lines = grid.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ''));
  if (lines.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...lines.map((r) => r.length));
  let lastUsed = 0;
  for (const r of lines) r.forEach((c, i) => c !== '' && (lastUsed = Math.max(lastUsed, i)));
  const cut = Math.min(width, lastUsed + 1);
  const pad = (r: string[]) => Array.from({ length: cut }, (_, i) => r[i] ?? '');
  const [head, ...rest] = lines.map(pad);
  return { headers: head!.map((h, i) => h || tNow('import.column', { n: i + 1 })), rows: rest };
}

export interface FileRowsResult {
  rows: DraftRow[];
  /** Rows skipped because they were completely empty after mapping. */
  skipped: number;
}

/** Builds drafts from the table using the chosen column mapping. Pinned values fill the blanks. */
export function rowsFromTable(table: FileTable, mapping: readonly (ImportField | null)[], defaults: PinnedDefaults = NO_PIN): FileRowsResult {
  const rows: DraftRow[] = [];
  let skipped = 0;
  for (const cells of table.rows) {
    const get = (field: ImportField): string => {
      const idx = mapping.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? '') : '';
    };
    if (!mapping.some((m, i) => m && cells[i])) {
      skipped += 1;
      continue;
    }
    const row = emptyDraft('file');
    const notes: string[] = [];
    const bad = (field: ImportField, value: string) => notes.push(tNow('import.note.badCell', { field: importFieldLabel(field), value }));

    row.title = get('title');
    row.description = get('description');

    const typeCell = get('type');
    if (typeCell) {
      const t = normalizeType(typeCell);
      if (t) row.type = t;
      else bad('type', typeCell);
    }
    const dealCell = get('deal_type');
    if (dealCell) {
      const d = normalizeDeal(dealCell);
      if (d) row.deal_type = d;
      else bad('deal_type', dealCell);
    }
    if (!row.deal_type && defaults.deal_type) {
      row.deal_type = defaults.deal_type;
      notes.push(tNow('import.note.dealBlank', { deal: labelsNow().deal[defaults.deal_type] }));
    }

    const priceCell = get('price');
    let currency = normalizeCurrency(get('currency'));
    if (get('currency') && !currency) bad('currency', get('currency'));
    if (priceCell) {
      const plain = parseLooseNumber(priceCell);
      if (plain !== null && plain > 0) row.price = String(plain);
      else {
        const smart = findPrice(flatten(priceCell));
        if (smart) {
          row.price = String(smart.value);
          currency = currency ?? smart.currency;
        } else bad('price', priceCell);
      }
    }
    if (!currency && defaults.currency && row.price) {
      currency = defaults.currency;
      notes.push(tNow('import.note.currencyBlank', { currency: currencyName(defaults.currency) }));
    }
    if (currency) row.currency = currency;

    const termsCell = get('price_terms');
    if (termsCell) {
      const t = normalizeTerms(termsCell);
      if (t) row.price_terms = t;
    }

    const areaCell = get('area_sqm');
    if (areaCell) {
      const plain = parseLooseNumber(areaCell);
      if (plain !== null && plain > 0) row.area_sqm = String(plain);
      else {
        const smart = findArea(flatten(areaCell)).value;
        if (smart !== null) row.area_sqm = String(smart);
        else bad('area_sqm', areaCell);
      }
    }
    for (const field of ['bedrooms', 'bathrooms'] as const) {
      const cell = get(field);
      if (!cell) continue;
      const n = parseLooseNumber(cell);
      if (n !== null && Number.isInteger(n) && n >= 0 && n <= 50) row[field] = String(n);
      else bad(field, cell);
    }

    // A province written in Pashto (or by its capital) is stored under its Dari name, like everywhere else.
    const provinceCell = get('province');
    row.province = (provinceCell && findProvince(flatten(provinceCell))) || provinceCell || defaults.province;
    row.district = get('district') || defaults.district;
    row.neighborhood = get('neighborhood');
    row.address = get('address');
    if (!row.address) row.address = addressFrom({ province: row.province, district: row.district, neighborhood: row.neighborhood, street: '' });
    else if (row.province && !row.address.includes(row.province)) {
      row.address = addressFrom({ province: row.province, district: '', neighborhood: '', street: row.address });
    }

    for (const field of ['lat', 'lng'] as const) {
      const cell = get(field);
      if (!cell) continue;
      const n = parseLooseNumber(cell.replace(/^-/, ''));
      if (n === null) bad(field, cell);
      else row[field] = String(cell.trim().startsWith('-') ? -n : n);
    }
    const imageCell = get('images');
    if (imageCell) row.images = [...new Set(imageCell.split(/[\s,;|]+/).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 20);

    if (!row.title.trim()) {
      row.title = composeTitle({
        type: row.type,
        deal: row.deal_type,
        bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
        area: row.area_sqm ? Number(row.area_sqm) : null,
        district: row.district,
        province: row.province,
      });
    }
    row.notes = notes;
    rows.push(row);
  }
  return { rows, skipped };
}

/**
 * The CSV the agent can download, fill and upload, written in `language` (its column names are the ones the mapping
 * step shows, so the file is recognised again). UTF-8 with a BOM so Excel shows Dari and Pashto correctly.
 */
export function templateCsv(language: Language = activeLanguage()): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const labels = labelsFor(language);
  const columns: ImportField[] = ['title', 'type', 'deal_type', 'price', 'currency', 'area_sqm', 'bedrooms', 'bathrooms', 'province', 'district', 'neighborhood', 'address', 'description'];
  const header = columns.map((field) => importFieldLabel(field, language));
  const provinceName = (name: string) => provinceNameLabel(name, language);
  const sample = [
    [t('import.template.title1'), labels.type.HOUSE_HAWILI, labels.deal.SALE, '85000', labels.currency.USD, '200', '3', '2', provinceName('کابل'), t('import.template.district1'), t('import.template.hood1'), t('import.template.near1'), t('import.template.note1')],
    [t('import.template.title2'), labels.type.APARTMENT, labels.deal.RENT, '12000', labels.currency.AFGHANI, '90', '2', '1', provinceName('هرات'), '', '', t('import.template.near2'), ''],
  ];
  const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return `\ufeff${[header, ...sample].map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`;
}
