import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { guessMapping, normalizeCurrency, normalizeDeal, normalizeType, rowsFromTable, tableFrom, templateCsv } from '@/lib/import/parse-file';
import { checkDraft, parseLatLng, splitLatLng, autoDescription } from '@/lib/import/draft-validation';
import { emptyDraft } from '@/lib/import/types';

describe('header mapping', () => {
  it('maps Persian headers', () => {
    const m = guessMapping(['عنوان', 'نوع ملک', 'نوع معامله', 'قیمت', 'ارز', 'متراژ', 'اتاق خواب', 'حمام', 'ولایت', 'ناحیه', 'آدرس', 'توضیحات', 'ستون عجیب']);
    expect(m).toEqual(['title', 'type', 'deal_type', 'price', 'currency', 'area_sqm', 'bedrooms', 'bathrooms', 'province', 'district', 'address', 'description', null]);
  });
  it('maps English headers, any case or punctuation', () => {
    expect(guessMapping(['Title', 'Property_Type', 'Deal Type', 'PRICE', 'Currency', 'Area (sqm)', 'Bedrooms', 'Province'])).toEqual([
      'title', 'type', 'deal_type', 'price', 'currency', 'area_sqm', 'bedrooms', 'province',
    ]);
  });
  it('lets a longer header win over a bare «نوع»', () => {
    const m = guessMapping(['نوع', 'نوع معامله']);
    expect(m).toEqual(['type', 'deal_type']);
  });
  it('maps a header that merely contains a known word', () => {
    expect(guessMapping(['قیمت کل (افغانی)'])).toEqual(['price']);
  });
  it('never maps two columns to one field', () => {
    const m = guessMapping(['قیمت', 'قیمت دوم']);
    expect(m.filter((x) => x === 'price')).toHaveLength(1);
  });
});

describe('cells', () => {
  it('types', () => {
    expect(normalizeType('آپارتمان')).toBe('APARTMENT');
    expect(normalizeType('خانه / حویلی')).toBe('HOUSE_HAWILI');
    expect(normalizeType('House')).toBe('HOUSE_HAWILI');
    expect(normalizeType('LAND')).toBe('LAND');
    expect(normalizeType('???')).toBeNull();
  });
  it('deals and currencies', () => {
    expect(normalizeDeal('فروشی')).toBe('SALE');
    expect(normalizeDeal('Rent')).toBe('RENT');
    expect(normalizeDeal('گروی')).toBe('MORTGAGE_GROWI');
    expect(normalizeCurrency('افغانی')).toBe('AFGHANI');
    expect(normalizeCurrency('USD')).toBe('USD');
    expect(normalizeCurrency('$')).toBe('USD');
    expect(normalizeCurrency('دالر')).toBe('USD');
    expect(normalizeCurrency('euro')).toBeNull();
  });
});

describe('rows from a table', () => {
  const table = tableFrom([
    ['عنوان', 'نوع', 'معامله', 'قیمت', 'ارز', 'متراژ', 'خواب', 'ولایت', 'آدرس'],
    ['خانه نو در شهرنو', 'خانه', 'فروش', '۸۵٬۰۰۰', 'دالر', '200', 3, 'کابل', 'شهر نو'],
    ['', 'آپارتمان', 'کرایه', '۱۲ هزار', '', '۹۰', '2', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['زمین', 'زمین', 'فروشی', 'abc', 'دالر', '', '', 'هرات', 'جاده'],
  ]);
  const mapping = guessMapping(table.headers);

  it('reads numbers with Persian digits and separators, and words like هزار', () => {
    const { rows, skipped } = rowsFromTable(table, mapping, { province: 'بلخ', district: '', deal_type: '', currency: 'AFGHANI' });
    expect(skipped).toBe(0); // the fully empty row was already dropped when the sheet was read
    expect(table.rows).toHaveLength(3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', price: '85000', currency: 'USD', area_sqm: '200', bedrooms: '3', province: 'کابل' });
    expect(rows[1]).toMatchObject({ type: 'APARTMENT', deal_type: 'RENT', price: '12000', currency: 'AFGHANI', area_sqm: '90', province: 'بلخ' });
  });
  it('fills blanks from the pinned defaults and says so', () => {
    const { rows } = rowsFromTable(table, mapping, { province: 'بلخ', district: 'ناحیه ۲', deal_type: '', currency: 'AFGHANI' });
    expect(rows[1]!.district).toBe('ناحیه ۲');
    expect(rows[1]!.address).toBe('بلخ، ناحیه ۲');
    expect(rows[1]!.notes.join(' ')).toContain('پیش‌فرض');
  });
  it('keeps going past a cell it cannot read and explains it', () => {
    const { rows } = rowsFromTable(table, mapping);
    expect(rows[2]!.price).toBe('');
    expect(rows[2]!.notes.join(' ')).toContain('«abc» خوانده نشد');
  });
  it('writes a title when the file has none', () => {
    const { rows } = rowsFromTable(table, mapping);
    expect(rows[1]!.title).toContain('آپارتمان');
  });
});

describe('table shape', () => {
  it('drops empty rows and trailing empty columns, and numbers the unnamed ones', () => {
    const t = tableFrom([['a', '', 'c', ''], ['', '', '', ''], ['1', '2', '3', '']]);
    expect(t.headers).toEqual(['a', 'ستون 2', 'c']);
    expect(t.rows).toEqual([['1', '2', '3']]);
  });
});

describe('template', () => {
  it('is a CSV the importer itself understands', () => {
    const csv = templateCsv();
    expect(csv.startsWith('﻿')).toBe(true);
    const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    const table = tableFrom(parsed.data);
    const { rows } = rowsFromTable(table, guessMapping(table.headers));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => checkDraft(r).ok)).toBe(true);
  });
});

describe('draft validation', () => {
  const good = () =>
    emptyDraft('form', {
      title: 'خانه سه خوابه در کابل',
      type: 'HOUSE_HAWILI',
      deal_type: 'SALE',
      price: '۸۵٬۰۰۰',
      currency: 'USD',
      area_sqm: '200',
      bedrooms: '3',
      province: 'کابل',
      address: 'کابل، ناحیه ۴',
    });

  it('accepts a complete draft and builds the request body', () => {
    const r = checkDraft(good());
    expect(r.ok).toBe(true);
    expect(r.input).toMatchObject({ price: 85000, currency: 'USD', area_sqm: 200, bedrooms: 3, province: 'کابل' });
    expect(r.input!.description.length).toBeGreaterThan(5); // written from the facts
  });
  it('says what is missing, in Persian, per field', () => {
    const r = checkDraft(emptyDraft('form'));
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['address', 'area_sqm', 'currency', 'deal_type', 'price', 'province', 'title', 'type']);
    expect(r.errors.type).toBe('نوع ملک را انتخاب کنید.');
  });
  it('lets a map pin stand in for the address', () => {
    const r = checkDraft({ ...good(), address: '', lat: '34.5281', lng: '69.1761' });
    expect(r.ok).toBe(true);
    expect(r.input).toMatchObject({ lat: 34.5281, lng: 69.1761 });
  });
  it('refuses a pin outside Afghanistan or a lone coordinate', () => {
    expect(checkDraft({ ...good(), lat: '10', lng: '20' }).errors.location).toContain('بیرون از افغانستان');
    expect(checkDraft({ ...good(), lat: '34.5', lng: '' }).errors.location).toBeTruthy();
  });
  it('ignores rooms for land', () => {
    const r = checkDraft({ ...good(), type: 'LAND', bedrooms: '3' });
    expect(r.ok).toBe(true);
    expect(r.input).not.toHaveProperty('bedrooms');
  });
  it('rejects a price with more than two decimals and a non-integer room count', () => {
    expect(checkDraft({ ...good(), price: '10.123' }).errors.price).toBeTruthy();
    expect(checkDraft({ ...good(), bedrooms: '2.5' }).errors.bedrooms).toBeTruthy();
  });
  it('caches the verdict per row object', () => {
    const row = good();
    expect(checkDraft(row)).toBe(checkDraft(row));
  });
  it('writes a description from the facts', () => {
    expect(autoDescription(good())).toContain('۲۰۰ متر مربع');
  });
});

describe('coordinates', () => {
  it('parse and split', () => {
    expect(parseLatLng('۳۴٫۵۲۸۱')).toBe(34.5281);
    expect(parseLatLng('abc')).toBeNull();
    expect(splitLatLng('34.5281, 69.1761')).toEqual({ lat: '34.5281', lng: '69.1761' });
    expect(splitLatLng('۳۴.۵ ۶۹.۱')).toEqual({ lat: '34.5', lng: '69.1' });
    expect(splitLatLng('hello')).toBeNull();
  });
});
