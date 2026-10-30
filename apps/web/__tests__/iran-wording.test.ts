// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import Papa from 'papaparse';
import { setActiveLanguage } from '@/i18n/active';
import { htmlLangFor, MARKET_COOKIE } from '@/i18n/config';
import { marketKey, translate, translateFor, type MessageKey } from '@/i18n/translate';
import { prs } from '@/i18n/messages/prs';
import { ps } from '@/i18n/messages/ps';
import { formatDate, formatDateTime } from '@/lib/format';
import { checkDraft } from '@/lib/import/draft-validation';
import { guessMapping, importFieldLabel, rowsFromTable, tableFrom, templateCsv } from '@/lib/import/parse-file';
import { setActiveMarket } from '@/lib/market';

afterEach(() => {
  setActiveLanguage('prs');
  setActiveMarket('AF');
});

/** Words an Iranian does not use: Afghan terms for places and property, and the names of Afghanistan, Dari and Pashto. */
const AFGHAN = ['دکان', 'دهلیز', 'ولایت', 'ولسوالی', 'افغان', 'کابل', 'هرات', 'کارته', 'حویلی', 'سرک', 'مارکیت', 'جریب', 'دری', 'پشتو', 'پښتو', 'کرایه', 'کرایی', 'جورآمد', 'گروی', 'رهنمای'];

const irKeys = (dictionary: Record<string, string>) => Object.keys(dictionary).filter((k) => k.endsWith('IR') || k.includes('.IR.'));

describe('Iran’s own wording', () => {
  it('is used in Iran when there is one, and the shared text otherwise or elsewhere', () => {
    expect(marketKey('form.districtPlaceholder', 'IR')).toBe('form.districtPlaceholderIR');
    expect(marketKey('form.districtPlaceholder', 'AF')).toBe('form.districtPlaceholder');
    expect(marketKey('form.districtPlaceholder', undefined)).toBe('form.districtPlaceholder');
    // No Iranian sibling: the shared text.
    expect(marketKey('login.pageTitle', 'IR')).toBe('login.pageTitle');
    expect(translateFor('prs', 'filter.search', 'IR')).toBe(prs['filter.searchIR']);
    expect(translateFor('prs', 'filter.search', 'AF')).toBe(prs['filter.search']);
  });

  it('has no Afghan word in any Iranian text, in either language', () => {
    for (const dictionary of [prs, ps] as Record<string, string>[]) {
      for (const key of irKeys(dictionary)) {
        // The Iranian deal/type/terms labels are checked by their own tests; here every Iranian sibling is read.
        for (const word of AFGHAN) expect(dictionary[key], `${key} says «${word}»`).not.toContain(word);
      }
    }
  });

  it('gives every Afghan text it replaces a sibling, and the same ones in both languages', () => {
    const wanted: MessageKey[] = [
      'app.descriptionIR', 'login.footerIR', 'setup.address.placeholderIR', 'filter.searchIR', 'text.exampleIR', 'import.field.districtIR',
      'form.districtPlaceholderIR', 'form.neighborhoodPlaceholderIR', 'form.addressHintIR', 'grid.h.districtIR', 'list.edit.districtIR', 'date.month.1IR',
    ];
    for (const key of wanted) expect(prs[key], key).toBeTruthy();
    expect(irKeys(prs).sort()).toEqual(irKeys(ps).sort());
  });

  it('keeps Afghanistan, Dari and Pashto out of the page description and metadata in Iran', () => {
    for (const language of ['prs', 'ps'] as const) {
      const text = [translateFor(language, 'app.description', 'IR'), translateFor(language, 'login.footer', 'IR')].join(' ');
      for (const word of ['افغان', 'دری', 'پشتو', 'پښتو']) expect(text).not.toContain(word);
    }
    // Afghanistan keeps its own text.
    expect(translateFor('prs', 'login.footer', 'AF')).toContain('افغانستان');
    expect(htmlLangFor('prs', 'IR')).toBe('fa-IR');
    expect(htmlLangFor('prs', 'AF')).toBe('fa-AF');
    expect(htmlLangFor('ps', 'AF')).toBe('ps-AF');
  });

  it('words the date with the Iranian months and Tehran’s clock in Iran', () => {
    const iso = '2026-03-21T06:00:00Z'; // 1 Farvardin 1405 = 1 Hamal 1405
    expect(formatDate(iso)).toContain('حمل');
    setActiveMarket('IR');
    expect(formatDate(iso)).toContain('فروردین');
    expect(formatDate(iso)).not.toContain('حمل');
    // 21:00 UTC is 00:30 on the next day in Tehran (+3:30) and 01:30 in Kabul (+4:30).
    expect(formatDateTime('2026-06-01T21:00:00Z')).toContain('۰۰:۳۰');
    setActiveMarket('AF');
    expect(formatDateTime('2026-06-01T21:00:00Z')).toContain('۰۱:۳۰');
  });

  it('writes the country into a cookie for the server-rendered parts', () => {
    setActiveMarket('IR');
    expect(document.cookie).toContain(`${MARKET_COOKIE}=IR`);
  });

  it('makes an Iranian sample file in Iranian words that the importer reads back', () => {
    const csv = templateCsv('prs', 'IR');
    for (const word of AFGHAN) expect(csv, word).not.toContain(word);
    setActiveMarket('IR');
    const table = tableFrom(Papa.parse<string[]>(csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' }).data);
    const mapping = guessMapping(table.headers);
    expect(mapping.every(Boolean), JSON.stringify(table.headers)).toBe(true);
    const { rows } = rowsFromTable(table, mapping, { ...{ province: '', district: '', deal_type: '', currency: '' }, market: 'IR' } as never);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'APARTMENT', deal_type: 'SALE', currency: 'TOMAN', province: 'تهران' });
    expect(rows[1]).toMatchObject({ type: 'APARTMENT', deal_type: 'MORTGAGE_RENT', currency: 'TOMAN' });
    expect(rows.every((r) => checkDraft(r).ok)).toBe(true);
    expect(importFieldLabel('district', 'prs', 'IR')).toBe('منطقه');
    expect(importFieldLabel('province', 'prs', 'IR')).toBe(translate('prs', 'import.field.provinceIR'));
    expect(importFieldLabel('district', 'prs', 'AF')).toBe(translate('prs', 'import.field.district'));
  });
});

describe('the country of a request', () => {
  it('comes from the cookie, and is Iran when there is none', async () => {
    let value: string | undefined;
    vi.resetModules();
    vi.doMock('next/headers', () => ({ cookies: async () => ({ get: () => (value === undefined ? undefined : { value }) }) }));
    const { getRequestMarket } = await import('@/i18n/server');
    expect(await getRequestMarket()).toBe('IR');
    value = 'AF';
    expect(await getRequestMarket()).toBe('AF');
    value = 'nonsense';
    expect(await getRequestMarket()).toBe('IR');
    vi.doUnmock('next/headers');
  });
});
