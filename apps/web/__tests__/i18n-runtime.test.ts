// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { setActiveLanguage } from '@/i18n/active';
import { translate } from '@/i18n/translate';
import { formatDate, formatCompact, formatMoney, formatRelative } from '@/lib/format';
import { checkDraft, autoDescription } from '@/lib/import/draft-validation';
import { composeTitle, parseText } from '@/lib/import/parse-text';
import { guessMapping, rowsFromTable, tableFrom, templateCsv } from '@/lib/import/parse-file';
import { emptyDraft } from '@/lib/import/types';
import { errorMessage, ApiError } from '@/lib/api';
import { labelsFor } from '@/lib/labels';

afterEach(() => setActiveLanguage('prs'));

describe('the language shown right now', () => {
  it('changes how data is formatted', () => {
    const iso = '2026-03-21T06:00:00Z'; // 1 Hamal 1405
    setActiveLanguage('prs');
    expect(formatDate(iso)).toContain('حمل');
    setActiveLanguage('ps');
    expect(formatDate(iso)).toContain('وری');
    expect(formatDate(iso)).not.toContain('حمل');
    setActiveLanguage('ps');
    expect(formatCompact(85_000)).toContain('زر');
    setActiveLanguage('prs');
    expect(formatCompact(85_000)).toContain('هزار');
    expect(formatMoney(12, 'USD')).toContain('دالر');
    setActiveLanguage('ps');
    expect(formatMoney(12, 'USD')).toContain('ډالر');
    expect(formatRelative(new Date().toISOString())).not.toBe('');
  });

  it('changes API error wording', () => {
    const err = new ApiError(403, { message: 'x', code: 'PERKS_REQUIRED' });
    setActiveLanguage('prs');
    const dari = errorMessage(err);
    setActiveLanguage('ps');
    const pashto = errorMessage(err);
    expect(pashto).toBe(translate('ps', 'err.code.PERKS_REQUIRED'));
    expect(pashto).not.toBe(dari);
  });

  it('re-checks a draft in the new language instead of serving the cached old text', () => {
    const row = emptyDraft('form', { title: 'ab' });
    setActiveLanguage('prs');
    expect(checkDraft(row).errors.title).toBe(translate('prs', 'list.col.titleShort'));
    setActiveLanguage('ps');
    expect(checkDraft(row).errors.title).toBe(translate('ps', 'list.col.titleShort'));
    setActiveLanguage('prs');
    expect(checkDraft(row).errors.type).toBe(translate('prs', 'v.type.required'));
  });

  it('writes titles and descriptions in the language shown', () => {
    const f = { type: 'APARTMENT' as const, deal: 'RENT' as const, bedrooms: 2, area: 90, province: 'هرات' };
    expect(composeTitle(f, 'prs')).toContain('کرایه');
    expect(composeTitle(f, 'ps')).toContain('کرایې');
    setActiveLanguage('ps');
    expect(autoDescription(emptyDraft('form', { type: 'APARTMENT', deal_type: 'RENT', area_sqm: '90' }))).toContain('مساحت');
  });
});

describe('Pashto input', () => {
  it('reads the Pashto example text the page offers', () => {
    setActiveLanguage('ps');
    const rows = parseText(translate('ps', 'text.example'));
    expect(rows).toHaveLength(2);
    const [house, flat] = rows;
    expect(house).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', price: '85000', currency: 'USD', area_sqm: '200', bedrooms: '3', province: 'کابل', price_terms: 'NEGOTIABLE' });
    expect(flat).toMatchObject({ type: 'APARTMENT', deal_type: 'RENT', price: '12000', currency: 'AFGHANI', area_sqm: '90', bedrooms: '2', province: 'هرات' });
  });

  it('reads the Dari example text too', () => {
    const rows = parseText(translate('prs', 'text.example'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', price: '85000', currency: 'USD' });
    expect(rows[1]).toMatchObject({ type: 'APARTMENT', deal_type: 'RENT', price: '12000', currency: 'AFGHANI' });
  });

  it('writes notes in the language shown', () => {
    setActiveLanguage('ps');
    const [row] = parseText('کور');
    expect(row!.notes).toContain(translate('ps', 'import.note.dealAssumed', { deal: labelsFor('ps').deal.SALE }));
  });

  it('makes a template in either language that the importer reads back', () => {
    for (const language of ['prs', 'ps'] as const) {
      setActiveLanguage(language);
      const csv = templateCsv(language);
      const table = tableFrom(Papa.parse<string[]>(csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' }).data);
      const mapping = guessMapping(table.headers);
      expect(mapping.every(Boolean), `${language}: ${JSON.stringify(mapping)}`).toBe(true);
      const { rows } = rowsFromTable(table, mapping);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ type: 'HOUSE_HAWILI', deal_type: 'SALE', currency: 'USD', province: 'کابل' });
      expect(rows[1]).toMatchObject({ type: 'APARTMENT', deal_type: 'RENT', currency: 'AFGHANI', province: 'هرات' });
      expect(rows.every((r) => checkDraft(r).ok), language).toBe(true);
    }
  });
});
