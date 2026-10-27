import { describe, expect, it } from 'vitest';
import { prs } from '@/i18n/messages/prs';
import { ps } from '@/i18n/messages/ps';
import { translate, type MessageKey } from '@/i18n/translate';
import { LANGUAGES, isLanguage } from '@/i18n/config';
import { labelsFor } from '@/lib/labels';
import { PROVINCES, provinceLabel, provinceNameLabel } from '@/lib/provinces';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('message files', () => {
  const keys = Object.keys(prs) as MessageKey[];

  it('offer Dari and Pashto, and only those', () => {
    expect([...LANGUAGES]).toEqual(['prs', 'ps']);
    expect(isLanguage('ps')).toBe(true);
    expect(isLanguage('fa')).toBe(false);
  });

  it('have exactly the same keys in both languages', () => {
    expect(Object.keys(ps).sort()).toEqual([...keys].sort());
  });

  it('never leave a message empty', () => {
    for (const key of keys) {
      expect(prs[key].trim(), `prs ${key}`).not.toBe('');
      expect(ps[key].trim(), `ps ${key}`).not.toBe('');
    }
  });

  it('use the same {placeholders} in both languages', () => {
    for (const key of keys) expect(placeholders(ps[key]), key).toEqual(placeholders(prs[key]));
  });

  it('are really translated: most Pashto messages differ from the Dari ones', () => {
    const same = keys.filter((k) => ps[k] === prs[k]).length;
    expect(same / keys.length).toBeLessThan(0.1);
  });
});

describe('translate', () => {
  it('fills placeholders in the language asked for', () => {
    expect(translate('prs', 'form.sessionCount', { n: 3 })).toContain('3');
    expect(translate('ps', 'form.sessionCount', { n: 3 })).toContain('3');
    expect(translate('ps', 'form.sessionCount', { n: 3 })).not.toBe(translate('prs', 'form.sessionCount', { n: 3 }));
  });
  it('leaves an unknown placeholder visible rather than hiding it', () => {
    expect(translate('prs', 'form.sessionCount', {})).toContain('{n}');
  });
  it('falls back to Dari for a key missing from a dictionary, never to the raw key', () => {
    expect(translate('ps', 'nope.nothing' as MessageKey)).toBe('nope.nothing');
  });
});

describe('labels and provinces', () => {
  it('follow the language', () => {
    expect(labelsFor('prs').deal.SALE).toBe('فروشی');
    expect(labelsFor('ps').deal.SALE).toBe('پلورنه');
    expect(labelsFor('ps').type.LAND).not.toBe(labelsFor('prs').type.LAND);
  });
  it('show provinces in Pashto while the stored value stays Dari', () => {
    const kandahar = PROVINCES.find((p) => p.name === 'قندهار')!;
    expect(provinceLabel(kandahar, 'prs')).toBe('قندهار');
    expect(provinceLabel(kandahar, 'ps')).toBe(kandahar.name_ps);
    expect(provinceNameLabel('قندهار', 'ps')).toBe(kandahar.name_ps);
    expect(provinceNameLabel('جای ناشناخته', 'ps')).toBe('جای ناشناخته');
    for (const p of PROVINCES) expect(p.name_ps.trim(), p.name).not.toBe('');
  });
});
